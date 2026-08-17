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

// Top-level agent entrypoint. The route handler calls `runChat()`; we own
// model selection, prompt assembly, tool wiring, persistence, telemetry,
// and the daily-budget guardrail in one place so route code stays a thin
// HTTP shell.
//
// SRP-1: The retry/fallback loop and budget reservation have been extracted
// to chat-retry-loop.ts and budget-reservation.ts. runChatInner now reads
// top-to-bottom as: setup → reserveTurnBudget → build messages → route →
// runChatWithFallback → budget.reconcile().

import { getMessageText, pickAiEnv } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import {
  convertToModelMessages,
  stepCountIs,
  type ModelMessage,
  type UIMessage,
  type LanguageModel,
} from 'ai';
import type { streamText } from 'ai';

import { telemetryConfig } from './telemetry';

import { buildLiveSnapshot } from './context';
import {
  DEFAULT_MAX_DAILY_USD,
  estimateCostUsd,
} from './cost';
import { compactThread } from './memory/thread-summary';
import {
  derivePlannerModel,
  supportsPromptCaching,
} from './model';
import { decryptByok, type ProviderId } from '@kestrel/shared/encryption';
import {
  appendUserMessage,
  listMessages,
  recordTelemetry,
} from './persistence';
import { runPlanner } from './planner';
import { extractUserMessageText } from './message-text';
import { routeTurn, type RoutingDecision } from './routing';
// generateTitle — moved to chat/auto-title.ts (P0-1)
import { withToolContext, type ToolContext } from './tool-context';
import { getUserWithSettings } from '@kestrel/db';
// P2-3 — DI container for testability. Services are registered in
// services.ts (auto-bootstrap on import). Tests can override via
// container.register('db', () => mockDb).
import { container } from '@kestrel/shared';
// P2-3 — auto-register services (db, llmClient) in the container.
import './services';
import type { RunChatArgs } from './types';
// UserSettingsRow — moved to chat/auto-title.ts (P0-1)
import { awaitLlmHeadroom } from './llm-throttle';
import { withDiagnostics, persistDiagnosticContext, getDiagnosticContext, recordStep, completeStep, exportDiagnosticContext } from './diagnostics';

// P0-1 — Extracted pipeline stages from this file.
import { resolveModelForTurn, type ResolveModelContext } from './chat/resolve-model';
import { flushBatchedTelemetry } from './chat/helpers';
import { buildTurnSystemPrompt } from './chat/system-prompt';
import { resolveActiveTools } from './chat/tools';
import { buildStreamCallbacks, type StreamCallbackState } from './chat/stream-callbacks';
import { reserveTurnBudget } from './budget-reservation';
import { runChatWithFallback, type AttemptResult } from './chat-retry-loop';
import { DB, LLM_CLIENT } from './tokens';

const alog = createCategorizedLogger('ai', { component: 'agent' });
/**
 * Runs one chat turn end-to-end:
 *   1. Daily-budget guardrail.
 *   2. Persist incoming user message.
 *   3. Load history, compact older messages into a summary, build LIVE_SNAPSHOT.
 *   4. Route the turn → pick model + decide if a plan-then-act step is needed.
 *   5. streamText with tools.
 *   6. On finish: persist assistant message + telemetry (incl. routing).
 *
 * Returns the AI SDK stream result; the caller pipes it to the response via
 * `result.toUIMessageStreamResponse()`.
 */
export async function runChat(args: RunChatArgs) {
  const { threadId, userId } = args;

  // F5 — Wrap the entire chat turn in a diagnostic context so that
  // every tool call, agent run, and persistence step can be traced.
  // If an error propagates out, we record it in the diagnostic context
  // and attach the (redacted) trace to the error for Sentry.
  return withDiagnostics(userId, threadId, () => runChatInner(args), {
    deferCompletion: true,
    ...(args.requestId ? { requestId: args.requestId } : {}),
  }).catch((err) => {
    // withDiagnostics attaches the completed failure trace before it leaves
    // its AsyncLocalStorage scope. Keep this catch as a compatibility
    // fallback for callers that throw outside that wrapper.
    if (err instanceof Error && !(err as Error & { diagnosticContext?: unknown }).diagnosticContext) {
      const diagCtx = exportDiagnosticContext();
      if (diagCtx) {
        try {
          (err as Error & { diagnosticContext?: unknown }).diagnosticContext = diagCtx;
        } catch {
          // Read-only error object — skip attachment.
        }
      }
    }
    throw err;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runChatInner(args: RunChatArgs): Promise<any> {
  const { threadId, userId, userMessage, env, modelOverride, customInstructions, signal } = args;
  const startedAt = Date.now();
  const diagnosticContext = getDiagnosticContext();

  // F5 — Record the start of the chat turn.
  recordStep('chat_turn_start', { threadId, model: modelOverride ?? 'default' });

  const db = container.resolve(DB);
  const { settings: userSettings, user: userRow } = await getUserWithSettings(userId);

  if (!userSettings) {
    throw new Error('User settings not found. Please complete onboarding.');
  }

  // Phase B — pick the display name from the user row, falling back to
  // the email local-part (the bit before @) if name is unset.
  const displayName =
    userRow?.name?.trim() ||
    (userRow?.email ? userRow.email.split('@')[0] : null);

  // PHASE-L-HARDEN: defensive floor — when both userSettings and env
  // are missing MAX_DAILY_USD the ceiling must be a finite number so
  // tryReserveBudget never passes NaN to the bigint column.
  const maxDailyUsd = userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD;

  // 1) Hard ceiling — atomic reservation against today's running counter.
  const budget = await reserveTurnBudget({ userId, maxDailyUsd });

  try {
    // 2) Persist the user message before we start streaming. If the model fails
    //    we still want the prompt in history so retries can resume.
    await appendUserMessage(userId, threadId, userMessage);
  recordStep('persist_user_message', { threadId });

  // 3) Load history + ambient snapshot in parallel; THEN apply rolling-summary
  //    compaction once we know the message count.
  recordStep('fetch_history_and_snapshot');
  const [history, snapshot] = await Promise.all([
    listMessages(userId, threadId, 60),
    buildLiveSnapshot({ signal, userId }),
  ]);
  completeStep('fetch_history_and_snapshot', 'completed');


  // Phase F — compaction uses the same cheap-model derivation as
  // the planner. Resolved once up front so the call site stays clean.
  const compactionModelId =
    derivePlannerModel(userSettings, env) ?? env.AI_DEFAULT_MODEL;
  const compactArgs: Parameters<typeof compactThread>[0] = {
    threadId,
    userId,
    history,
    env,
    compactionModelId,
  };
  if (signal) compactArgs.signal = signal;
  const compaction = await compactThread(compactArgs);

  // Gemini and most providers reject role: 'system' messages anywhere
  // except the very first position. We carry two flavours of system rows
  // in the thread: the rolling-summary note (already folded into the
  // system prompt as `compaction.extraSystem`) and the planner's
  // `data-plan` parts (Phase 7c — persisted as role='system' by
  // planner.persistPlan). Both are UI / context-only — feeding
  // them inline would crash the next turn with
  // "system messages are only supported at the beginning of the conversation".
  // Drop them here and rely on `streamText`'s `system` parameter instead.
  //
  // P2-10: Also defensively filter any non-system message that contains
  // a `data-plan` part — this guards against a future role change in
  // persistPlan that would bypass the role-based filter.
  const conversational = compaction.kept.filter((m) => {
    if (m.role === 'system') return false;
    // Defensive: drop any message whose sole purpose is a data-plan part.
    if (Array.isArray(m.parts) && m.parts.length === 1) {
      const first = m.parts[0];
      if (first && typeof first === 'object' && (first as { type?: string }).type === 'data-plan') {
        return false;
      }
    }
    return true;
  });

  const modelMessages: ModelMessage[] = convertToModelMessages(
    conversational.map(
      (m): UIMessage => ({
        id: m.id,
        role: m.role as UIMessage['role'],
        parts: (Array.isArray(m.parts) && m.parts.length > 0
          ? m.parts            : [{ type: 'text' as const, text: getMessageText(m) }]) as UIMessage['parts'],
      }),
    ),
  );

  // 4) Model resolution — routeTurn picks a domain; we map that to the
  // provider's tier-appropriate model (fundamental→pro, technical→fast,
  // summary→cheapest, etc.). The override path stays the same (per-thread
  // pick from the regen-model-picker). When no override is set, the
  // domain parameter tells resolveChatModel which defaultModels tier to use.
  const routingArgs: Parameters<typeof routeTurn>[0] = { userMessage };
  if (modelOverride !== undefined) routingArgs.modelOverride = modelOverride;
  // Q5: wire semantic routing when env flag is enabled.
  if (env.AI_SEMANTIC_ROUTING_ENABLED) {
    const plannerModelId = derivePlannerModel(userSettings, env) ?? env.AI_DEFAULT_MODEL;
    routingArgs.semanticRouting = {
      modelId: plannerModelId,
      env: pickAiEnv(env),
      ...(signal ? { signal } : {}),
    };
  }
  const routing: RoutingDecision = await routeTurn(routingArgs);
  recordStep('routing', { domain: routing.domain, planRequired: routing.planRequired });

  // PERF-05: Decrypt BYOK keys once per request, not once per retry attempt.
  // AES-256-GCM is synchronous CPU work; hoisting it avoids 1-4 redundant
  // decryptions when the retry loop fires on transient provider errors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decryptedByokKeys: any = userSettings.aiApiKeys ? decryptByok(userSettings.aiApiKeys) : null;

  // ── Retry / fallback loop ──────────────────────────────────────────
  // SRP-1: The retry loop + fallback chain is extracted to runChatWithFallback.
  // The attempt callback handles model resolution, planning, and streaming.

  // A stream can report lifecycle callbacks asynchronously. Keep one
  // terminal state (shared with the extracted stream callbacks) so a late
  // error cannot downgrade a completed trace or reconcile/release the same
  // turn twice. `fallbackInfo` is written by the retry loop's onFallback and
  // read by onFinish.
  const streamState: StreamCallbackState = { streamTerminal: 'pending', fallbackInfo: null };

  // resolveCtx is a shared object — checkedProviders persists across attempts.
  const checkedProviders = new Set<string>();
  const resolveCtx: ResolveModelContext = {
    currentModelOverride: modelOverride,
    settings: userSettings,
    env,
    nonEssentialDisabled: false,
    checkedProviders,
    userId,
    routing,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamResult: any = await runChatWithFallback({
    maxAttempts: 5,
    initialModelOverride: modelOverride ?? undefined,
    userId,
    budget,
    signal,
    userSettings: { aiFallbackChain: userSettings.aiFallbackChain as unknown },
    decryptedByokKeys: decryptedByokKeys as unknown,
    env: { GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY },
    routing,
    onFallback: (info) => { streamState.fallbackInfo = info; },
    attempt: async (attemptCtx): Promise<AttemptResult> => {
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
    },
  });

  return streamResult;
  } catch (err) {
    // The stream's onFinish owns reconciliation after a successful model
    // call. Every failure before a stream is returned must release the
    // reservation, including persistence, snapshot, compaction, routing,
    // and model-resolution failures.
    await budget.release();
    await persistDiagnosticContext(diagnosticContext, 'failed');
    throw err;
  }
}

// P0-1 — runAutoTitleBackground, countToolCalls, and flushBatchedTelemetry
// extracted to chat/auto-title.ts and chat/helpers.ts.
