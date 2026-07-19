/**
 * Copyright 2026 HamaFX
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

import { getMessageText, pickAiEnv, type AiEnvKeys, type ServerEnv } from '@hamafx/shared';
import { logErrorContext, createCategorizedLogger } from '@hamafx/shared/logger';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
  type LanguageModel,
  type Tool,
} from 'ai';

import { buildLiveSnapshot } from './context';
import type { LiveSnapshot } from './prompt/system';
import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_MAX_DAILY_USD,
  DEFAULT_TURN_ESTIMATE_USD,
  estimateCostUsd,
  tryReserveBudget,
  checkBudgetAlertsAndThresholds,
} from './cost';
import { classifyStreamError, makeFallbackPart, type FallbackPartPayload } from './fallback';
import { estimateContextUsage } from './token-estimate';
import { compactThread } from './memory/thread-summary';
import {
  derivePlannerModel,
  deriveTitleModel,
  resolveChatModel,
  resolveOverrideModel,
  resolveModelForProvider,
  getVertexGoogleSearchTool,
  supportsPromptCaching,
} from './model';
import { decryptByok, type ProviderId } from '@hamafx/shared/encryption';
import { PROVIDER_IDS } from '@hamafx/shared/byok';
import {
  appendAssistantMessage,
  appendUserMessage,
  getThread,
  listMessages,
  recordTelemetry,
  recordToolTelemetry,
  updateThreadTitle,
} from './persistence';
import { runPlanner } from './planner';
import { buildSystemPrompt, userContextFromSettings } from './prompt/system';
import { extractUserMessageText } from './message-text';
import { routeTurn, type RoutingDecision } from './routing';
import { generateTitle } from './title';
import { toModelDomain, pickNextFallbackProvider } from './model-resolution';
import { withToolContext, type ToolContext } from './tool-context';
import { tools } from './tools';
import { enforceCitations } from './verification';
import { waitUntil } from './wait-until';
import { getDb, schema, getUserWithSettings } from '@hamafx/db';
import { domainToolFilter, type RoutingDomain } from './tools/by-domain';
import type { UserSettingsRow } from '@hamafx/db/schema';
import { extractRateLimits } from './rate-limits';
import { noteLlmRateLimit, awaitLlmHeadroom } from './llm-throttle';
import { withDiagnostics, recordStep, completeStep, recordError, exportDiagnosticContext } from './diagnostics';

const alog = createCategorizedLogger('ai', { component: 'agent' });

export interface RunChatArgs {
  threadId: string;
  /** Phase A — the authenticated user owning this chat turn. */
  userId: string;
  /** Most recent user UIMessage to append + answer. */
  userMessage: UIMessage;
  /** Whole env — caller passes the already-validated ServerEnv env subset. */
  env: Pick<ServerEnv, AiEnvKeys>;
  /** Optional model override (e.g. coming from thread.modelOverride). */
  modelOverride?: string | null;
  /** Custom instructions to append to the system prompt. */
  customInstructions?: string;
  /** Aborts streaming + tool calls when the client disconnects. */
  signal?: AbortSignal;
}
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
  return withDiagnostics(userId, threadId, () => runChatInner(args)).catch((err) => {
    recordError(err);
    // Attach the diagnostic context to the error so upstream Sentry
    // reporting can include the full (redacted) trace.
    const diagCtx = exportDiagnosticContext();
    if (diagCtx && err instanceof Error) {
      try {
        (err as Error & { diagnosticContext?: unknown }).diagnosticContext = diagCtx;
      } catch {
        // Read-only error object — skip attachment.
      }
    }
    throw err;
  });
}

async function runChatInner(args: RunChatArgs) {
  const { threadId, userId, userMessage, env, modelOverride, customInstructions, signal } = args;
  const startedAt = Date.now();

  // F5 — Record the start of the chat turn.
  recordStep('chat_turn_start', { threadId, model: modelOverride ?? 'default' });

  const db = getDb();
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
  //    Two concurrent turns sitting at 99% of the cap can't both pass:
  //    Postgres serialises the row-level UPDATE so exactly one wins. A
  //    `recordTelemetry` call at the end reconciles the reservation with
  //    the actual cost (delta between estimated and observed).
  const reservation = await tryReserveBudget(userId, DEFAULT_TURN_ESTIMATE_USD, maxDailyUsd);
  if (!reservation.ok) {
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }
  const reservedUsd = DEFAULT_TURN_ESTIMATE_USD;

  // 2) Persist the user message before we start streaming. If the model fails
  //    we still want the prompt in history so retries can resume.
  await appendUserMessage(threadId, userMessage);
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
  const decryptedByokKeys = userSettings.aiApiKeys ? decryptByok(userSettings.aiApiKeys) : null;

  let fallbackInfo: FallbackPartPayload | null = null;
  let attempts = 0;
  const maxAttempts = 5;
  let lastError: unknown = null;
  let currentModelOverride = modelOverride;
  let nonEssentialDisabled = false;
  // P5: avoid re-running checkBudgetAlertsAndThresholds on every retry attempt.
  // Each provider needs at most one check per turn.
  const checkedProviders = new Set<string>();
  // F1 — capture narrowed settings for use in the inner retry helper.
  const settings = userSettings;
  // STAB-02: Track whether the budget reservation has already been released
  // (on non-retryable error or client disconnect) so the post-loop release
  // doesn't double-count and underflow the daily_ai_spend counter.
  let budgetReleased = false;

  /**
   * Resolves the model for the current retry attempt (respects override
   * or routing domain). Also checks provider budget thresholds.
   * Throws on budget blocks or provider threshold violations; the caller
   * converts those into fallback decisions in the catch block.
   */
  async function resolveModelForTurn(): Promise<{
    resolvedModel: LanguageModel;
    resolvedModelId: string;
    providerId: ProviderId;
    nonEssentialDisabled: boolean;
  }> {
    const domainParam = toModelDomain(routing.domain);
    let resolvedModel: LanguageModel;
    let resolvedModelId: string;
    let providerId: ProviderId;

    if (typeof currentModelOverride === 'string' && currentModelOverride.length > 0) {
      const resolved = resolveOverrideModel({
        override: currentModelOverride,
        userSettings: settings,
        env,
      });
      if (resolved) {
        resolvedModel = resolved.model;
        resolvedModelId = resolved.modelId;
        providerId = resolved.providerId;
      } else {
        // AI-1: Log when a user-specified model override cannot be
        // resolved and falls back to default.
        alog.warn('Model override not resolved — falling back', {
          override: currentModelOverride,
        });
        const sep = currentModelOverride.indexOf(':');
        const possibleProviderId = (sep >= 0 ? currentModelOverride.slice(0, sep) : currentModelOverride) as ProviderId;
        if (PROVIDER_IDS.includes(possibleProviderId)) {
          const res = resolveModelForProvider(possibleProviderId, settings, env);
          resolvedModel = res.model;
          resolvedModelId = res.modelId;
          providerId = res.providerId;
        } else {
          const res = resolveChatModel(settings, env, domainParam);
          resolvedModel = res.model;
          resolvedModelId = res.modelId;
          providerId = res.providerId;
        }
      }
    } else {
      const res = resolveChatModel(settings, env, domainParam);
      resolvedModel = res.model;
      resolvedModelId = res.modelId;
      providerId = res.providerId;
    }

    // P5: skip budget check if we already checked this provider this turn.
    let budgetCheck: Awaited<ReturnType<typeof checkBudgetAlertsAndThresholds>>;
    if (providerId && checkedProviders.has(providerId)) {
      budgetCheck = { blocked: false, nonEssentialDisabled };
    } else {
      if (providerId) checkedProviders.add(providerId);
      budgetCheck = await checkBudgetAlertsAndThresholds(userId, providerId);
    }
    if (budgetCheck.blocked) {
      if (budgetCheck.blockedReason?.includes('Monthly budget limit reached')) {
        throw new Error(budgetCheck.blockedReason);
      } else {
        throw new Error(`PROVIDER_THRESHOLD_EXCEEDED: ${budgetCheck.blockedReason}`);
      }
    }

    return { resolvedModel, resolvedModelId, providerId, nonEssentialDisabled: budgetCheck.nonEssentialDisabled };
  }

  while (attempts < maxAttempts) {
    attempts++;
    let resolvedModel: LanguageModel;
    let resolvedModelId: string;
    let providerId: ProviderId | undefined;

    try {
      const result = await resolveModelForTurn();
      resolvedModel = result.resolvedModel;
      resolvedModelId = result.resolvedModelId;
      providerId = result.providerId;
      nonEssentialDisabled = result.nonEssentialDisabled;
    } catch (err) {
      lastError = err;
      const isProviderThresholdErr = err instanceof Error && err.message.startsWith('PROVIDER_THRESHOLD_EXCEEDED');
      const decision = isProviderThresholdErr
        ? { fallback: true, reason: 'rate-limit' as const, message: err.message }
        : classifyStreamError(err);
      if (!decision.fallback) {
        // STAB-02: Release budget reservation on non-retryable error.
        // Without this, permanent provider failures (e.g. invalid API key)
        // inflate daily_ai_spend and prematurely trip BudgetExceededError.
        await applyBudgetDelta(userId, -reservedUsd).catch(() => {});
        budgetReleased = true;
        throw err;
      }

      // Fallback! Determine current provider for chain walk.
      const currentProvider = providerId ?? ((typeof currentModelOverride === 'string' && currentModelOverride.length > 0)
        ? (currentModelOverride.includes(':') ? currentModelOverride.split(':')[0] : currentModelOverride)
        : 'google') as ProviderId;

      const nextFallback = pickNextFallbackProvider(
        userSettings.aiFallbackChain ?? [],
        currentProvider,
        decryptedByokKeys,
        env.GOOGLE_GENERATIVE_AI_API_KEY,
        routing.domain,
      );

      if (!nextFallback) {
        throw err;
      }

      alog.warn('Fallback triggered — model resolution failed', { nextProvider: nextFallback.providerId });

      // The fallback marker shows which model was attempted.
      // Note: path 1 doesn't have a resolved providerId yet (resolution
      // itself failed), so we use 'auto' vs the current override string.
      // Path 2 (stream failure) uses the actual providerId:bareModelId
      // because model resolution succeeded before the stream errored.
      fallbackInfo = makeFallbackPart(
        currentModelOverride ?? 'auto',
        decision,
      );

      currentModelOverride = nextFallback.modelId
        ? `${nextFallback.providerId}:${nextFallback.modelId}`
        : nextFallback.providerId;
      continue;
    }

    // 4b) Plan-then-act (Phase 7c). Runs only when `routing.planRequired`
    //     is true (fundamental + technical domains today). The planner
    //     persists a `data-plan` system-message right before the streaming
    //     turn so the chat surface renders a collapsible "Thinking" pill
    //     above the assistant's answer. Failures fall back deterministically
    //     and never block the main streamText call.
    let plannerResult: Awaited<ReturnType<typeof runPlanner>> | null = null;
    const parts = resolvedModelId.split('/');
    const bareModelId = parts.length > 1 ? parts[1] : resolvedModelId;

    if (routing.planRequired) {
      // Phase F — derive the planner model from the chat model rather
      // than reading env.AI_SUMMARY_MODEL (which no longer exists).
      // The planner is a separate cheap-model call, so we use the same
      // provider's spec.defaultModels.summary tier.
      const plannerModelId =
        derivePlannerModel(
          {
            aiApiKeys: userSettings.aiApiKeys,
            chatModel: `${providerId}:${bareModelId}`,
          },
          env
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
        if (plannerResult.source === 'llm' && env.LOG_PROMPTS) {
          console.info(
            '[ai] planner ok (steps=%d, tools=%o)',
            plannerResult.plan.steps.length,
            plannerResult.plan.expectedTools,
          );
        }
        // Telemetry — record a single row tagged `kind: 'plan_*'` so the
        // /settings/usage page can see how often the planner runs and how
        // much it costs. Best-effort; never blocks the chat.
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
        });
      } catch (err) {
        alog.warn('planner threw — falling back', { err: String(err) });
      }
    }

    // The base system prompt is unchanged; we prepend the (optional) thread
    // summary as a system note so the model has continuity beyond the verbatim
    // tail. The plan-then-act expansion (Phase 7c) lands here too — for now
    // we just record `planRequired` in telemetry so routing decisions are
    // auditable today.
    const baseSystem = buildSystemPrompt(
      snapshot,
      userContextFromSettings(displayName ?? null, userSettings),
    );
    let systemPrompt = compaction.extraSystem
      ? `${compaction.extraSystem}\n\n${baseSystem}`
      : baseSystem;

    if (customInstructions && customInstructions.trim().length > 0) {
      systemPrompt += `\n\n<USER_CUSTOM_INSTRUCTIONS>\n${customInstructions}\n</USER_CUSTOM_INSTRUCTIONS>`;
    }

    // F4 — Context-window-aware token estimation. Warn (or truncate) when
    // the conversation approaches the model's context limit. Helps prevent
    // silent crashes on long threads with smaller-context models like Claude.
    // Uses a per-attempt COPY so truncation doesn't persist across retries
    // when switching to a larger-context provider.
    let effectiveMessages = modelMessages;
    const totalContentLen = effectiveMessages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
    const contextEstimate = estimateContextUsage(
      resolvedModelId,
      systemPrompt.length,
      effectiveMessages.length,
      totalContentLen,
    );
    if (contextEstimate.warningNote) {
      systemPrompt = `${contextEstimate.warningNote}\n\n${systemPrompt}`;
    }
    if (contextEstimate.shouldTruncate && contextEstimate.suggestedKeepCount) {
      recordStep('context_truncation', {
        estimatedTokens: contextEstimate.estimatedTokens,
        contextLimit: contextEstimate.contextLimit,
        originalCount: effectiveMessages.length,
        keptCount: contextEstimate.suggestedKeepCount,
      });
      effectiveMessages = effectiveMessages.slice(-contextEstimate.suggestedKeepCount);
    }

    // Phase 3 hardening §1 — `withToolContext` replaces the per-module
    // setter pattern (`setAnalyzeChartImageContext`,
    // `setSummarizeThreadContext`). Async-local storage means concurrent
    // turns on the same warm Lambda see their own context and can't
    // overwrite each other's threadId. The signal is piped through so
    // long-running tools can short-circuit when the user closes the tab
    // (Phase 3 §3). The budget snapshot is cached so multiple LLM-side
    // helpers (planner, title, summarize_thread) don't each issue their
    // own SUM query (Phase 3 §4).
    const toolContext: ToolContext = {
      threadId,
      userId,
      latestUserMessageText: extractUserMessageText(userMessage),
      env: pickAiEnv(env),
      signal: signal ?? null,
      // The reservation we just took is the freshest budget snapshot we
      // can offer. Helpers that need a stricter "have we crossed the
      // cap?" probe still hit the DB.
      budget: { spent: reservation.spent, max: maxDailyUsd },
      userSettings,
      toolTelemetryBuffer: [],  // M4: batch telemetry inserts
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

    // Telemetry breadcrumb for the routing decision — useful for /settings/usage
    // breakdowns. Best-effort; failures here never block the chat.
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

    // 5) Stream. AI Gateway model strings ("openai/gpt-4.1") are accepted
    //    directly when AI_GATEWAY_API_KEY is set.
    //
    // Phase 3 hardening §2 — per-tool telemetry now lives in
    // `withTelemetry()` on each tool, NOT in `onStepFinish` here. The
    // step-finish hook is left empty so we still have a hook point for
    // future SDK-side step instrumentation, but it no longer parses
    // content parts to derive tool-call timing — that's fragile and
    // duplicates the wrapper.

    // H3: Domain-based tool subsetting — reduces per-turn token overhead
    // by 60-80%. Only pass tools relevant to the routing domain.
    // 'generic' domain gets all tools (fallback for unclassified messages).
    const activeTools = domainToolFilter(routing.domain as RoutingDomain) as Record<string, Tool>;
    if (nonEssentialDisabled) {
      delete activeTools.convene_committee;
      delete activeTools.replay_setup;
    }

    // PERF-4: enable prompt caching for the stable system prefix.
    const streamArgs: Parameters<typeof streamText>[0] = {
      model: resolvedModel,
      system: systemPrompt,
      ...(supportsPromptCaching(resolvedModelId)
        ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
        : {}),
      messages: effectiveMessages,
      tools: routing.domain === 'fundamental' && env.GOOGLE_VERTEX_PROJECT
        ? { ...activeTools, googleSearch: getVertexGoogleSearchTool(env, userId) } 
        : activeTools,
      stopWhen: stepCountIs(env.MAX_TOOL_ITERATIONS),

      onFinish: async ({ usage, finishReason, response }) => {
        try {
          const assistantUiMsg = response.messages.at(-1);
          let messageId: string | null = null;
          if (assistantUiMsg && assistantUiMsg.role === 'assistant') {
            // Convert the model-shaped response back to a UIMessage shape.
            const baseParts: UIMessage['parts'] = Array.isArray(assistantUiMsg.content)
              ? (assistantUiMsg.content as UIMessage['parts'])
              : [{ type: 'text', text: String(assistantUiMsg.content) }];

            // Phase 7c: post-finish citation enforcement. We append a
            // `data-citation-warning` part when the assistant's text quotes
            // numbers / events that aren't backed by a tool call this turn.
            // The check is heuristic and `stance: 'soft'` so false positives
            // render as muted footer pills, not blocking errors.
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

            // Phase B — UX_UPGRADE_PLAN.md item 15.
            // Append the fallback marker so the chat surface can show
            // "Override unavailable, used <default>." inline with the
            // assistant's reply. The renderer (apps/web) already
            // understands `data-fallback` from the markdown export
            // pipeline so we reuse the same shape.
            if (fallbackInfo) {
              parts = [...parts, fallbackInfo as unknown as UIMessage['parts'][number]];
            }

            const ui: UIMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              parts,
            };
            ({ messageId } = await appendAssistantMessage(threadId, ui));


          }
          const rateLimit = extractRateLimits(response.headers);
          if (rateLimit) {
            noteLlmRateLimit(`${providerId}:${userId}`, rateLimit);
            // PERF-6: single upsert off the response path (no DELETE+INSERT).
            // The provider_tests PK is (user_id, provider_id) so ON CONFLICT
            // DO UPDATE is safe and idempotent.
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
          // M4: Flush batched tool telemetry via bulk insert.
          const buffer = toolContext.toolTelemetryBuffer;
          if (buffer && buffer.length > 0) {
            await flushBatchedTelemetry(buffer);
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
          // Reconcile the budget reservation with the actual post-call cost.
          // Positive delta = we underestimated; negative = release. Keeps
          // the running counter in `daily_ai_spend` aligned with the audit
          // SUM in `chat_telemetry`.
          const actualCost = estimateCostUsd(
            resolvedModelId,
            usage?.inputTokens ?? 0,
            usage?.outputTokens ?? 0,
          );
          await applyBudgetDelta(userId, actualCost - reservedUsd).catch((err) =>
            alog.warn('applyBudgetDelta failed', { err: String(err) }),
          );
          if (env.LOG_PROMPTS) {
            console.info('[ai] finish reason=%s tokens=%o', finishReason, usage);
          }
        } catch (err) {
          // Persistence failures must not crash the stream — log and move on.
          logErrorContext(err, 'persistence/telemetry_failed', { threadId }, 'ai');
        }

        // Phase 2 hardening §8 — auto-title is the slow tail of onFinish:
        // a 1-3 s LLM call that the user doesn't need to see before the
        // streaming dots disappear. Hand it off to `waitUntil` so Vercel
        // keeps the function alive long enough for the title to land,
        // but the response stream closes immediately. Outside Vercel
        // (worker / tests) `waitUntil` is a fire-and-forget shim.
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
      },
    };
    if (signal) streamArgs.abortSignal = signal;

    try {
      // RL-3: pre-emptively gate on provider rate-limit headroom.
      const headroomKey = `${providerId}:${userId}`;
      await awaitLlmHeadroom(headroomKey, signal ? { signal } : {});
      recordStep('stream_text', { model: resolvedModelId, attempt: attempts });
      const result = await withToolContext(toolContext, () => Promise.resolve(streamText(streamArgs)));
      completeStep('stream_text', 'completed');
      return result;
    } catch (err) {
      lastError = err;
      // M4: Flush tool telemetry on error path too — don't lose data.
      const buffer = toolContext.toolTelemetryBuffer;
      if (buffer && buffer.length > 0) {
        flushBatchedTelemetry(buffer).catch(() => {});
      }
      // F13 — don't retry when the client disconnected. The user closed the
      // tab, so any retry would produce a response nobody reads while still
      // consuming the daily budget. Release the reservation immediately.
      if (signal?.aborted) {
        // STAB-02: Release budget reservation on client disconnect.
        await applyBudgetDelta(userId, -reservedUsd).catch(() => {});
        budgetReleased = true;
        throw err;
      }
      const decision = classifyStreamError(err);
      if (!decision.fallback) {
        // STAB-02: Release budget reservation on non-retryable stream error.
        await applyBudgetDelta(userId, -reservedUsd).catch(() => {});
        budgetReleased = true;
        throw err;
      }

      // Fallback! Get next provider from chain
      const nextFallback = pickNextFallbackProvider(
        userSettings.aiFallbackChain ?? [],
        providerId,
        decryptedByokKeys,
        env.GOOGLE_GENERATIVE_AI_API_KEY,
        routing.domain,
      );

      if (!nextFallback) {
        throw err;
      }

      alog.warn('Fallback triggered — provider failed', { provider: String(providerId), reason: decision.reason, message: decision.message, nextProvider: nextFallback.providerId });          // F2 — unified fallback part construction. Uses the override string
      // when available (same as model-resolution path), otherwise shows the
      // current provider that failed.
      fallbackInfo = makeFallbackPart(
        currentModelOverride ?? `${providerId}:${bareModelId}`,
        decision,
      );

      currentModelOverride = nextFallback.modelId
        ? `${nextFallback.providerId}:${nextFallback.modelId}`
        : nextFallback.providerId;
    }
  }

  // All retry attempts exhausted without a successful stream — release the
  // budget reservation we took at the top of the turn. Without this, repeated
  // failures inflate daily_ai_spend and prematurely trip BudgetExceededError.
  // STAB-02: Skip if already released on a non-retryable error or client
  // disconnect to avoid double-counting.
  if (!budgetReleased) {
    await applyBudgetDelta(userId, -reservedUsd).catch((err) =>
      alog.warn('failed to release budget reservation after exhausted retries', { err: String(err) }),
    );
  }
  throw lastError ?? new Error('All fallback attempts failed');
}

/**
 * Slow tail of `onFinish` (Phase 2 hardening §8). Runs the auto-title
 * generator on first turn and persists the result; failures are logged
 * but never crash the stream because the response is already closed by
 * the time we reach this code.
 */
async function runAutoTitleBackground(args: {
  threadId: string;
  userId: string;
  userSettings: UserSettingsRow;
  env: RunChatArgs['env'];
  signal: AbortSignal | null;
}): Promise<void> {
  const { threadId, userId, userSettings, env, signal } = args;
  try {
    const thread = await getThread(userId, threadId);
    if (!thread || thread.title !== null) return;
    const all = await listMessages(userId, threadId, 50);
    const firstUser = (all.find((m) => m.role === 'user')?.content ?? '').slice(0, 1024);
    const firstAssistant = (all.find((m) => m.role === 'assistant')?.content ?? '').slice(0, 1024);
    if (firstUser.length === 0 || firstAssistant.length === 0) return;

    const titleStartedAt = Date.now();
    // Phase F — derive the title model from the user's chat model
    // (cheapest tier of the same provider, falling back to
    // AI_DEFAULT_MODEL on miss). Removes the per-deployment
    // AI_TITLE_MODEL env-var dependency.
    const titleModelId =
      deriveTitleModel(userSettings, env) ?? env.AI_DEFAULT_MODEL;
    const titleArgs: Parameters<typeof generateTitle>[0] = {
      threadId,
      firstUser,
      firstAssistant,
      titleModelId,
      env: pickAiEnv(env),
    };
    if (signal) titleArgs.signal = signal;
    const titleResult = await generateTitle(titleArgs);
    await updateThreadTitle(threadId, titleResult.title, titleResult.source);
    const kind: 'title_generated' | 'title_skipped_budget' | 'title_failed' =
      titleResult.source === 'llm'
        ? 'title_generated'
        : titleResult.reason === 'budget'
          ? 'title_skipped_budget'
          : 'title_failed';
    await recordTelemetry({
      userId,
      threadId,
      messageId: null,
      model: titleModelId,
      inputTokens: titleResult.inputTokens ?? 0,
      outputTokens: titleResult.outputTokens ?? 0,
      toolCalls: 0,
      ms: titleResult.latencyMs ?? Date.now() - titleStartedAt,
      kind,
    });
  } catch (err) {
    logErrorContext(err, 'auto-title_background_failed', { threadId }, 'ai');
  }
}

function countToolCalls(messages: readonly { content: unknown }[]): number {
  let n = 0;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        (part as { type: string }).type === 'tool-call'
      ) {
        n += 1;
      }
    }
  }
  return n;
}

/** M4: Bulk-insert batched tool telemetry records at onFinish. */
async function flushBatchedTelemetry(
  entries: Array<{ threadId: string | null; userId?: string | null; tool: string; ms: number; ok: boolean; errorCode?: string | null; outputChars?: number | null }>,
): Promise<void> {
  if (entries.length === 0) return;
  await Promise.all(entries.map((e) =>
    recordToolTelemetry({ ...e, messageId: null }).catch(() => {}),
  ));
}


