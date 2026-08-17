/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// P0-2 — Extracted from agent.ts. Owns the streamText lifecycle callbacks
// (onError / onFinish): terminal-state guarding, citation enforcement,
// assistant-message + telemetry persistence, rate-limit capture, tool
// telemetry flush, budget reconciliation, diagnostic completion, and the
// auto-title slow tail. agent.ts becomes a thin orchestrator.

import type { UIMessage, streamText } from 'ai';

import { metrics } from '@kestrel/shared';
import { flushMetrics } from '@kestrel/shared/metrics-export';
import { logErrorContext, createCategorizedLogger } from '@kestrel/shared/logger';
import type { ProviderId } from '@kestrel/shared/encryption';
import { schema, type DbClient } from '@kestrel/db';
import type { UserSettingsRow } from '@kestrel/db/schema';

import { estimateCostUsd } from '../cost';
import type { FallbackPartPayload } from '../fallback';
import { flushLangfuse } from '../instrumentation';
import {
  appendAssistantMessage,
  recordTelemetry,
} from '../persistence';
import { enforceCitations } from '../verification';
import { waitUntil } from '../wait-until';
import { extractRateLimits } from '../rate-limits';
import { noteLlmRateLimit } from '../llm-throttle';
import {
  persistDiagnosticContext,
  recordStep,
  completeStep,
  recordError,
  type RunDiagnosticContext,
} from '../diagnostics';
import type { ToolContext } from '../tool-context';
import type { BudgetHandle } from '../budget-reservation';
import type { RunChatArgs } from '../types';
import { countToolCalls, flushBatchedTelemetry } from './helpers';
import { runAutoTitleBackground } from './auto-title';

const alog = createCategorizedLogger('ai', { component: 'agent' });

type StreamTextOptions = Parameters<typeof streamText>[0];
type OnError = NonNullable<StreamTextOptions['onError']>;
type OnFinish = NonNullable<StreamTextOptions['onFinish']>;

/**
 * Mutable per-turn state shared between onError/onFinish and the outer
 * retry loop. A single terminal state prevents a late stream error from
 * downgrading a completed trace or reconciling/releasing the same turn
 * twice. `fallbackInfo` is written by the retry loop's onFallback and read
 * by onFinish.
 */
export interface StreamCallbackState {
  streamTerminal: 'pending' | 'completed' | 'failed';
  fallbackInfo: FallbackPartPayload | null;
}

export interface BuildStreamCallbacksArgs {
  state: StreamCallbackState;
  threadId: string;
  userId: string;
  startedAt: number;
  resolvedModelId: string;
  providerId: ProviderId;
  bareModelId: string | undefined;
  plannerCostUsd: number;
  budget: BudgetHandle;
  diagnosticContext: RunDiagnosticContext | null;
  toolContext: ToolContext;
  db: DbClient;
  userSettings: UserSettingsRow;
  env: RunChatArgs['env'];
  signal: AbortSignal | null;
}

export function buildStreamCallbacks(args: BuildStreamCallbacksArgs): {
  onError: OnError;
  onFinish: OnFinish;
} {
  const {
    state,
    threadId,
    userId,
    startedAt,
    resolvedModelId,
    providerId,
    bareModelId,
    plannerCostUsd,
    budget,
    diagnosticContext,
    toolContext,
    db,
    userSettings,
    env,
    signal,
  } = args;

  const onError: OnError = async ({ error }) => {
    if (state.streamTerminal === 'completed') {
      alog.warn('late chat stream error after completion', {
        threadId,
        model: resolvedModelId,
        providerId,
        err: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    state.streamTerminal = 'failed';
    metrics.increment('run_failed_total');
    // A stream can fail after streamText() has returned, bypassing
    // the retry-loop catch and onFinish. Release the reservation so
    // a disconnected/provider-failed turn cannot strand daily spend.
    recordError(error);
    completeStep('stream_text', 'failed', Date.now() - startedAt, {
      error: error instanceof Error ? error.message : String(error),
    });
    alog.error('chat stream failed after handoff', {
      threadId,
      model: resolvedModelId,
      providerId,
      err: error instanceof Error ? error.message : String(error),
    });
    void recordTelemetry({
      userId,
      threadId,
      messageId: null,
      model: resolvedModelId,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      ms: Date.now() - startedAt,
      kind: 'turn_failed',
    }).catch((telemetryErr) =>
      alog.error('failed to persist stream failure telemetry', { err: String(telemetryErr) }),
    );
    await budget.release();
    await persistDiagnosticContext(diagnosticContext, 'failed');
    await flushLangfuse();
    await flushMetrics();
  };

  const onFinish: OnFinish = async ({ usage, finishReason, response }) => {
    if (state.streamTerminal === 'failed') {
      alog.warn('chat stream finished after a recorded failure', {
        threadId,
        model: resolvedModelId,
        providerId,
      });
      return;
    }
    state.streamTerminal = 'completed';
    const actualCost = estimateCostUsd(
      resolvedModelId,
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
    ) + plannerCostUsd;
    try {
      const assistantUiMsg = response.messages.at(-1);
      let messageId: string | null = null;
      if (assistantUiMsg && assistantUiMsg.role === 'assistant') {
        const baseParts: UIMessage['parts'] = Array.isArray(assistantUiMsg.content)
          ? (assistantUiMsg.content as UIMessage['parts'])
          : [{ type: 'text', text: String(assistantUiMsg.content) }];

        let parts: UIMessage['parts'] = baseParts;
        try {
          const assistantText = baseParts
            .filter(
              (p): p is { type: 'text'; text: string } =>
                typeof p === 'object' &&
                p !== null &&
                (p as { type?: string }).type === 'text' &&
                typeof (p as { text?: unknown }).text === 'string',
            )
            .map((p) => p.text)
            .join('\n');
          const warning = enforceCitations({
            text: assistantText,
            responseMessages: response.messages,
          });
          if (warning) {
            parts = [...baseParts, warning as unknown as UIMessage['parts'][number]];
          }
        } catch (err) {
          alog.warn('citation enforcer failed', { err: String(err) });
        }

        if (state.fallbackInfo) {
          parts = [...parts, state.fallbackInfo as unknown as UIMessage['parts'][number]];
        }

        const ui: UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts,
        };
        ({ messageId } = await appendAssistantMessage(userId, threadId, ui));
      }
      const rateLimit = extractRateLimits(response.headers);
      if (rateLimit) {
        noteLlmRateLimit(`${providerId}:${userId}`, rateLimit);
        waitUntil(
          db
            .insert(schema.providerTests)
            .values({
              userId,
              providerId,
              ok: true,
              error: null,
              testedAt: new Date().toISOString(),
              rateLimit: rateLimit as { remainingRequests?: number; remainingTokens?: number; resetRequests?: string; resetTokens?: string; } | null,
            })
            .onConflictDoUpdate({
              target: [schema.providerTests.userId, schema.providerTests.providerId],
              set: {
                ok: true,
                error: null,
                testedAt: new Date().toISOString(),
                rateLimit: rateLimit as { remainingRequests?: number; remainingTokens?: number; resetRequests?: string; resetTokens?: string; } | null,
              },
            })
            .execute()
            .catch((err: unknown) =>
              alog.warn('failed to save provider test rate limits', { err: String(err) }),
            ),
        );
      }
      const buffer = toolContext.toolTelemetryBuffer;
      if (buffer && buffer.length > 0) {
        const telemetryFlush = await flushBatchedTelemetry(buffer);
        recordStep('tool_telemetry_flush', {
          attempted: telemetryFlush.attempted,
          failed: telemetryFlush.failed,
        });
        buffer.length = 0;
      }

      await recordTelemetry({
        userId,
        threadId,
        messageId,
        model: resolvedModelId,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        toolCalls: countToolCalls(response.messages),
        ms: Date.now() - startedAt,
      });
      if (env.LOG_PROMPTS) {
        console.info('[ai] finish reason=%s tokens=%o', finishReason, usage);
      }
    } catch (err) {
      logErrorContext(err, 'persistence/telemetry_failed', { threadId }, 'ai');
    } finally {
      // Reconcile independently of message/telemetry persistence. A
      // telemetry outage must not strand the turn reservation.
      await budget.reconcile(actualCost);
      // Phase E metrics — count the completed turn and observe cost/
      // latency for the chat SLO. Tag the outcome so Grafana can compute
      // a success-rate SLI (`{result="ok"}` / total). Widened to `string`
      // because control-flow analysis narrows `streamTerminal` to
      // `'completed'` here even though `onError` can set it to `'failed'`.
      metrics.increment('chat_turn_total', {
        tags: {
          result: (state.streamTerminal as string) === 'failed' ? 'fail' : 'ok',
        },
      });
      metrics.observe('total_latency_ms', Date.now() - startedAt);
      metrics.observe('turn_cost_usd', actualCost);
      // A stream result is returned before onFinish runs, so the
      // diagnostic wrapper defers completion until this callback.
      await persistDiagnosticContext(diagnosticContext, 'completed');
      // Vercel/serverless runtimes may freeze as soon as the stream
      // callback completes; flush after terminal persistence so the
      // Langfuse trace is not lost in the exporter queue.
      await flushLangfuse();
      // Same freeze risk applies to OTLP metrics — push the in-process
      // registry before the runtime can recycle the instance.
      await flushMetrics();
    }

    waitUntil(
      runAutoTitleBackground({
        threadId,
        userId,
        userSettings: {
          ...userSettings,
          chatModel: `${providerId}:${bareModelId}`,
        },
        env,
        signal: signal ?? null,
      }),
    );
  };

  return { onError, onFinish };
}
