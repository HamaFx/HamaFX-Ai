/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

// P0-2 — Extracted from agent.ts. Builds the per-attempt callback passed to
// `runChatWithFallback`. The callback owns: model resolution, the planner
// pre-step, system-prompt assembly, tool context + filtering, the stream
// callbacks, and the streamText call (with LLM headroom gating).
//
// The callback is a pure function of its context object — no nested closure
// over runChatInner locals — so the retry loop and the attempt body stay
// independently testable. Shared mutable state (`streamState`,
// `resolveCtx`) is threaded through explicitly.

import { createCategorizedLogger } from '@kestrel/shared/logger';
import {
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import type { streamText } from 'ai';
import { container, metrics } from '@kestrel/shared';
import type { DbClient } from '@kestrel/db';
import type { UserSettingsRow } from '@kestrel/db/schema';
import type { ProviderId } from '@kestrel/shared/encryption';
import { pickAiEnv } from '@kestrel/shared';

import { telemetryConfig } from '../telemetry';
import { estimateCostUsd } from '../cost';
import { derivePlannerModel, supportsPromptCaching } from '../model';
import { recordTelemetry } from '../persistence';
import { runPlanner } from '../planner';
import { extractUserMessageText } from '../message-text';
import { awaitLlmHeadroom } from '../llm-throttle';
import { recordStep, completeStep, type RunDiagnosticContext } from '../diagnostics';
import { withToolContext, type ToolContext } from '../tool-context';
import { LLM_CLIENT } from '../tokens';
import type { RunChatArgs } from '../types';
import type { AttemptContext, AttemptResult } from '../chat-retry-loop';
import type { BudgetHandle } from '../budget-reservation';
import type { RoutingDecision } from '../routing';
import type { CompactResult } from '../memory/thread-summary';
import type { LiveSnapshot } from '../prompt/system';
import { resolveModelForTurn, type ResolveModelContext } from './resolve-model';
import { flushBatchedTelemetry } from './helpers';
import { buildTurnSystemPrompt } from './system-prompt';
import { resolveActiveTools } from './tools';
import { buildStreamCallbacks, type StreamCallbackState } from './stream-callbacks';
import type { StreamTextResult } from '../llm-client';

const alog = createCategorizedLogger('ai', { component: 'agent' });

export interface BuildAttemptArgs {
  /** Shared terminal state mutated by onError/onFinish. */
  streamState: StreamCallbackState;
  /** Shared model-resolution context; mutated across attempts. */
  resolveCtx: ResolveModelContext;
  routing: RoutingDecision;
  userSettings: UserSettingsRow;
  env: RunChatArgs['env'];
  snapshot: LiveSnapshot | null;
  compaction: CompactResult;
  modelMessages: ModelMessage[];
  displayName: string | null;
  customInstructions?: string | undefined;
  threadId: string;
  userId: string;
  userMessage: UIMessage;
  maxDailyUsd: number;
  budget: BudgetHandle;
  db: DbClient;
  diagnosticContext: RunDiagnosticContext | null;
  startedAt: number;
  signal: AbortSignal | null;
  persistMessages: boolean;
  telemetryKind?: 'legacy_shadow';
}

/**
 * Build the per-attempt callback for `runChatWithFallback`. Each retry
 * re-runs model resolution → planner → prompt assembly → streaming; the
 * fallback chain drives `attemptCtx.currentModelOverride` between attempts.
 */
export function buildAttemptCallback(
  args: BuildAttemptArgs,
): (ctx: AttemptContext) => Promise<AttemptResult<StreamTextResult>> {
  const {
    streamState,
    resolveCtx,
    routing,
    userSettings,
    env,
    snapshot,
    compaction,
    modelMessages,
    displayName,
    customInstructions,
    threadId,
    userId,
    userMessage,
    maxDailyUsd,
    budget,
    db,
    diagnosticContext,
    startedAt,
    signal,
    persistMessages,
    telemetryKind,
  } = args;

  return async (attemptCtx): Promise<AttemptResult<StreamTextResult>> => {
    // ── Model resolution ────────────────────────────────────────────
    let resolvedModel: LanguageModel;
    let resolvedModelId: string;
    let providerId: ProviderId | undefined;

    try {
      resolveCtx.currentModelOverride = attemptCtx.currentModelOverride;
      resolveCtx.nonEssentialDisabled = attemptCtx.nonEssentialDisabled;
      const result = await resolveModelForTurn(resolveCtx);
      resolvedModel = result.resolvedModel;
      resolvedModelId = result.resolvedModelId;
      providerId = result.providerId;
      // Update shared context from result (may have been changed by budget checks)
      if (result.nonEssentialDisabled !== undefined) {
        resolveCtx.nonEssentialDisabled = result.nonEssentialDisabled;
      }
    } catch (err) {
      return { success: false, error: err, nonEssentialDisabled: attemptCtx.nonEssentialDisabled };
    }

    // ── Planner ─────────────────────────────────────────────────────
    let plannerResult: Awaited<ReturnType<typeof runPlanner>> | null = null;
    let plannerCostUsd = 0;
    const parts = resolvedModelId.split('/');
    const bareModelId = parts.length > 1 ? parts[1] : resolvedModelId;

    if (routing.planRequired) {
      const plannerModelId =
        derivePlannerModel(
          {
            aiApiKeys: userSettings.aiApiKeys,
            chatModel: `${providerId}:${bareModelId}`,
          },
          env,
        ) ?? env.AI_DEFAULT_MODEL;
      try {
        plannerResult = await runPlanner({
          threadId,
          userMessage,
          routing,
          plannerModelId,
          env: pickAiEnv(env),
          ...(signal ? { signal } : {}),
        });
        plannerCostUsd = estimateCostUsd(
          plannerModelId,
          plannerResult.inputTokens,
          plannerResult.outputTokens,
        );
        if (plannerResult.source === 'llm' && env.LOG_PROMPTS) {
          console.info(
            '[ai] planner ok (steps=%d, tools=%o)',
            plannerResult.plan.steps.length,
            plannerResult.plan.expectedTools,
          );
        }
        void recordTelemetry({
          userId,
          threadId,
          messageId: plannerResult.messageId,
          model: plannerModelId,
          inputTokens: plannerResult.inputTokens,
          outputTokens: plannerResult.outputTokens,
          toolCalls: 0,
          ms: plannerResult.ms,
          kind:
            plannerResult.source === 'llm'
              ? 'plan_generated'
              : plannerResult.reason === 'budget'
                ? 'plan_skipped_budget'
                : 'plan_failed',
        }).catch((telemetryErr) =>
          alog.error('planner telemetry failed', { threadId, err: String(telemetryErr) }),
        );
      } catch (err) {
        alog.warn('planner threw — falling back', { err: String(err) });
      }
    }

    // ── System prompt + context estimation ──────────────────────────
    const { systemPrompt, effectiveMessages } = buildTurnSystemPrompt({
      snapshot,
      displayName: displayName ?? null,
      userSettings,
      compactionExtraSystem: compaction.extraSystem,
      customInstructions,
      resolvedModelId,
      modelMessages,
    });

    // ── Tool context ────────────────────────────────────────────────
    const toolContext: ToolContext = {
      threadId,
      userId,
      latestUserMessageText: extractUserMessageText(userMessage),
      env: pickAiEnv(env),
      signal: signal ?? null,
      budget: { spent: budget.spent, max: maxDailyUsd },
      userSettings,
      db,
      toolTelemetryBuffer: [],
    };

    if (env.LOG_PROMPTS) {
      console.info(
        '[ai] routing domain=%s model=%s plan=%s rationale=%s',
        routing.domain,
        resolvedModelId,
        routing.planRequired,
        routing.rationale,
      );
      console.info('[ai] system prompt:\n%s', systemPrompt);
      console.info(
        '[ai] history (%d msgs, compacted %d)',
        modelMessages.length,
        compaction.compacted,
      );
    }

    // Routing telemetry breadcrumb
    void recordTelemetry({
      userId,
      threadId,
      messageId: null,
      model: resolvedModelId,
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
      ms: 0,
      kind: `routing_${routing.domain}` as const,
    }).catch((err) => alog.warn('routing telemetry failed', { err: String(err) }));

    // ── Tool filtering ──────────────────────────────────────────────
    const userPlan = (env as Record<string, unknown>).USER_PLAN_TIER as string | undefined;
    const activeTools = resolveActiveTools({
      routingDomain: routing.domain,
      userPlanTier: userPlan,
      nonEssentialDisabled: resolveCtx.nonEssentialDisabled,
      env,
      userId,
    });

    // ── Stream callbacks + args ─────────────────────────────────────
    const { onError, onFinish } = buildStreamCallbacks({
      state: streamState,
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
      signal: signal ?? null,
      persistMessages,
      ...(telemetryKind ? { telemetryKind } : {}),
    });

    const streamArgs: Parameters<typeof streamText>[0] = {
      model: resolvedModel,
      system: systemPrompt,
      ...telemetryConfig({ functionId: 'chat.stream' }),
      ...(supportsPromptCaching(resolvedModelId)
        ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
        : {}),
      messages: effectiveMessages,
      tools: activeTools,
      stopWhen: stepCountIs(env.MAX_TOOL_ITERATIONS),
      onError,
      onFinish,
    };
    if (signal) streamArgs.abortSignal = signal;

    // ── Stream ──────────────────────────────────────────────────────
    try {
      const headroomKey = `${providerId}:${userId}`;
      await awaitLlmHeadroom(headroomKey, signal ? { signal } : {});
      recordStep('stream_text', { model: resolvedModelId, attempt: attemptCtx.attemptNumber });
      const result = await withToolContext(toolContext, async () => {
        const client = container.resolve(LLM_CLIENT);
        const streamTextOpts: Record<string, unknown> = {
          model: resolvedModel,
          system: systemPrompt,
          messages: effectiveMessages,
          telemetry: telemetryConfig({ functionId: 'chat.stream' }),
        };
        if (streamArgs.tools) streamTextOpts.tools = streamArgs.tools;
        if (streamArgs.stopWhen) streamTextOpts.stopWhen = streamArgs.stopWhen;
        if (signal) streamTextOpts.abortSignal = signal;
        if (streamArgs.providerOptions) streamTextOpts.providerOptions = streamArgs.providerOptions;
        if (streamArgs.onFinish) streamTextOpts.onFinish = streamArgs.onFinish;
        if (streamArgs.onError) streamTextOpts.onError = streamArgs.onError;

        return client.streamText(streamTextOpts as unknown as Parameters<typeof client.streamText>[0]);
      });
      // Phase D SLI — time from turn start until the model call is producing
      // a stream. The eval harness measures true first-token latency from the
      // HTTP stream; this production signal covers the setup path (model
      // resolution + planner + headroom wait) that the harness cannot see.
      metrics.observe('ttft_ms', Date.now() - startedAt);
      completeStep('stream_text', 'completed');
      return {
        success: true,
        value: result,
        providerId,
        bareModelId,
      };
    } catch (err) {
      const buffer = toolContext.toolTelemetryBuffer;
      if (buffer && buffer.length > 0) {
        void flushBatchedTelemetry(buffer).catch((telemetryErr) =>
          alog.error('tool telemetry flush failed after stream error', {
            threadId,
            err: String(telemetryErr),
          }),
        );
      }
      return {
        success: false,
        error: err,
        providerId,
        bareModelId,
        nonEssentialDisabled: resolveCtx.nonEssentialDisabled,
      };
    }
  };
}
