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

import { type ServerEnv } from '@hamafx/shared';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
  type LanguageModel,
} from 'ai';

import { buildLiveSnapshot } from './context';
import type { LiveSnapshot } from './prompt/system';
import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_TURN_ESTIMATE_USD,
  estimateCostUsd,
  tryReserveBudget,
  checkBudgetAlertsAndThresholds,
} from './cost';
import { classifyStreamError, makeFallbackPart, type FallbackPartPayload } from './fallback';
import { compactThread } from './memory/thread-summary';
import {
  derivePlannerModel,
  deriveTitleModel,
  resolveChatModel,
  resolveOverrideModel,
  resolveModelForProvider,
  getVertexGoogleSearchTool,
} from './model';
import { decryptByok, type ProviderId } from '@hamafx/shared/encryption';
import { PROVIDER_IDS } from '@hamafx/shared/byok';
import { BYOK_PROVIDERS } from './byok-providers';
import {
  appendAssistantMessage,
  appendUserMessage,
  getThread,
  listMessages,
  recordTelemetry,
  updateThreadTitle,
} from './persistence';
import { runPlanner } from './planner';
import { buildSystemPrompt, userContextFromSettings } from './prompt/system';
import { extractUserMessageText } from './message-text';
import { routeTurn, type RoutingDecision } from './routing';
import { generateTitle } from './title';
import { withToolContext, type ToolContext } from './tool-context';
import { tools } from './tools';
import { enforceCitations } from './verification';
import { waitUntil } from './wait-until';
import { getDb, schema } from '@hamafx/db';
import { extractDecisionSignal, createDecisionSignal } from './decision-signals';
import type { UserSettingsRow } from '@hamafx/db/schema';
import { and, eq } from 'drizzle-orm';
import { extractRateLimits } from './rate-limits';
import { withDiagnostics, recordStep, completeStep, recordError, exportDiagnosticContext } from './diagnostics';

export interface RunChatArgs {
  threadId: string;
  /** Phase A — the authenticated user owning this chat turn. */
  userId: string;
  /** Most recent user UIMessage to append + answer. */
  userMessage: UIMessage;
  /** Whole env — caller passes the already-validated ServerEnv. */
  env: Pick<
    ServerEnv,
    | 'AI_GATEWAY_API_KEY'
    | 'GOOGLE_GENERATIVE_AI_API_KEY'
    | 'GOOGLE_VERTEX_PROJECT'
    | 'GOOGLE_VERTEX_LOCATION'
    | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
    | 'GOOGLE_APPLICATION_CREDENTIALS'
    | 'AI_DEFAULT_MODEL'
    | 'AI_EMBEDDING_MODEL'
    | 'MAX_DAILY_USD'
    | 'MAX_TOOL_ITERATIONS'
    | 'LOG_PROMPTS'
  >;
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
  const [userSettings, userRow] = await Promise.all([
    db.select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .then((rows) => rows[0]),
    db.select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .then((rows) => rows[0]),
  ]);

  if (!userSettings) {
    throw new Error('User settings not found. Please complete onboarding.');
  }

  // Phase B — pick the display name from the user row, falling back to
  // the email local-part (the bit before @) if name is unset.
  const displayName =
    userRow?.name?.trim() ||
    (userRow?.email ? userRow.email.split('@')[0] : null);

  const maxDailyUsd = userSettings.maxDailyUsd ?? env.MAX_DAILY_USD;

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
  // `data-plan` parts (Phase 7c). Both are UI / context-only — feeding
  // them inline would crash the next turn with
  // "system messages are only supported at the beginning of the conversation".
  // Drop them here and rely on `streamText`'s `system` parameter instead.
  const conversational = compaction.kept.filter((m) => m.role !== 'system');

  const modelMessages: ModelMessage[] = convertToModelMessages(
    conversational.map(
      (m) =>
        ({
          id: m.id,
          role: m.role,
          parts: (Array.isArray(m.parts) && m.parts.length > 0
            ? m.parts
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : [{ type: 'text', text: (m as any).content || (m as any).text || '' }]) as UIMessage['parts'],
        }) as UIMessage,
    ),
  );

  // 4) Model resolution — Phase F collapses the per-domain picker into
  // a single chat_model. The override path stays the same (per-thread
  // pick from the regen-model-picker); the default path is now just
  // resolveChatModel which honours user_settings.chatModel (or the
  // highest-priority configured provider's spec defaults).
  const routingArgs: Parameters<typeof routeTurn>[0] = { userMessage, env };
  if (modelOverride !== undefined) routingArgs.modelOverride = modelOverride;
  const routing: RoutingDecision = routeTurn(routingArgs);
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

  while (attempts < maxAttempts) {
    attempts++;
    let resolvedModel: LanguageModel;
    let resolvedModelId: string;
    let providerId: ProviderId;

    try {
      if (typeof currentModelOverride === 'string' && currentModelOverride.length > 0) {
        const resolved = resolveOverrideModel({
          override: currentModelOverride,
          userSettings,
          env,
        });
        if (resolved) {
          resolvedModel = resolved.model;
          resolvedModelId = resolved.modelId;
          providerId = resolved.providerId;
        } else {
          // If override couldn't be resolved, try resolving model for the override provider ID if it is one of PROVIDER_IDS
          const sep = currentModelOverride.indexOf(':');
          const possibleProviderId = (sep >= 0 ? currentModelOverride.slice(0, sep) : currentModelOverride) as ProviderId;
          if (PROVIDER_IDS.includes(possibleProviderId)) {
            const res = resolveModelForProvider(possibleProviderId, userSettings, env);
            resolvedModel = res.model;
            resolvedModelId = res.modelId;
            providerId = res.providerId;
          } else {
            const res = resolveChatModel(userSettings, env);
            resolvedModel = res.model;
            resolvedModelId = res.modelId;
            providerId = res.providerId;
          }
        }
      } else {
        const res = resolveChatModel(userSettings, env);
        resolvedModel = res.model;
        resolvedModelId = res.modelId;
        providerId = res.providerId;
      }
      
      const budgetCheck = await checkBudgetAlertsAndThresholds(userId, providerId);
      if (budgetCheck.blocked) {
        if (budgetCheck.blockedReason?.includes('Monthly budget limit reached')) {
          throw new Error(budgetCheck.blockedReason);
        } else {
          throw new Error(`PROVIDER_THRESHOLD_EXCEEDED: ${budgetCheck.blockedReason}`);
        }
      }
      nonEssentialDisabled = budgetCheck.nonEssentialDisabled;
    } catch (err) {
      lastError = err;
      const isProviderThresholdErr = err instanceof Error && err.message.startsWith('PROVIDER_THRESHOLD_EXCEEDED');
      const decision = isProviderThresholdErr
        ? { fallback: true, reason: 'rate-limit' as const, message: err.message }
        : classifyStreamError(err);
      if (!decision.fallback) {
        throw err;
      }


      // Fallback! Get next provider from chain
      const chain = userSettings.aiFallbackChain ?? [];
      let nextProviderId: ProviderId | null = null;
      
      // If we don't have a provider ID yet because resolution failed, default to the first in the chain
      const currentProvider: ProviderId = (typeof currentModelOverride === 'string' && currentModelOverride.length > 0)
        ? (currentModelOverride.includes(':') ? currentModelOverride.split(':')[0] : currentModelOverride) as ProviderId
        : 'google'; // default fallback starting point if resolution fails completely

      const idx = chain.indexOf(currentProvider);
      // PERF-05: Use the pre-decrypted BYOK keys hoisted above the loop.
      const stored = decryptedByokKeys;
      for (let i = idx + 1; i < chain.length; i++) {
        const pid = chain[i] as ProviderId;
        const key = stored?.[pid] || (pid === 'google' ? env.GOOGLE_GENERATIVE_AI_API_KEY : undefined);
        if (typeof key === 'string' && key.trim().length > 0) {
          nextProviderId = pid;
          break;
        }
      }

      if (!nextProviderId) {
        throw err;
      }

      console.warn(
        `[ai] Fallback triggered! Model resolution failed. Trying next fallback provider: "${nextProviderId}"`,
      );

      fallbackInfo = makeFallbackPart(
        currentModelOverride ?? 'default',
        decision
      );

      const nextSpec = BYOK_PROVIDERS[nextProviderId];
      if (nextSpec && nextSpec.defaultModels.technical) {
        currentModelOverride = `${nextProviderId}:${nextSpec.defaultModels.technical}`;
      } else {
        currentModelOverride = nextProviderId;
      }
      continue;
    }

    // 4b) Plan-then-act (Phase 7c). Runs only when `routing.planRequired`
    //     is true (fundamental + technical domains today). The planner
    //     persists a `data-plan` system-message right before the streaming
    //     turn so the chat surface renders a collapsible "Thinking" pill
    //     above the assistant's answer. Failures fall back deterministically
    //     and never block the main streamText call.
    let plannerStartedAt = 0;
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
      plannerStartedAt = Date.now();
      try {
        plannerResult = await runPlanner({
          threadId,
          userMessage,
          routing,
          plannerModelId,
          env: {
            AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
            GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
            GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
            GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
            GOOGLE_APPLICATION_CREDENTIALS_JSON:
              env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
            GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
            AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
            MAX_DAILY_USD: env.MAX_DAILY_USD,
            LOG_PROMPTS: env.LOG_PROMPTS,
          },
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
        console.warn('[ai] planner threw — falling back', err);
      }
    }
    void plannerStartedAt;

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
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
        GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
        GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
        GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
        AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
        AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL,
        MAX_DAILY_USD: env.MAX_DAILY_USD,
        LOG_PROMPTS: env.LOG_PROMPTS,
      },
      signal: signal ?? null,
      // The reservation we just took is the freshest budget snapshot we
      // can offer. Helpers that need a stricter "have we crossed the
      // cap?" probe still hit the DB.
      budget: { spent: reservation.spent, max: maxDailyUsd },
      userSettings,
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
    }).catch((err) => console.warn('[ai] routing telemetry failed', err));

    // 5) Stream. AI Gateway model strings ("openai/gpt-4.1") are accepted
    //    directly when AI_GATEWAY_API_KEY is set.
    //
    // Phase 3 hardening §2 — per-tool telemetry now lives in
    // `withTelemetry()` on each tool, NOT in `onStepFinish` here. The
    // step-finish hook is left empty so we still have a hook point for
    // future SDK-side step instrumentation, but it no longer parses
    // content parts to derive tool-call timing — that's fragile and
    // duplicates the wrapper.

    const activeTools = { ...tools };
    if (nonEssentialDisabled) {
      delete (activeTools as Record<string, unknown>).convene_committee;
      delete (activeTools as Record<string, unknown>).replay_setup;
    }

    const streamArgs: Parameters<typeof streamText>[0] = {
      model: resolvedModel,
      system: systemPrompt,
      messages: modelMessages,
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
              console.warn('[ai] citation enforcer failed — skipping', err);
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

            // F1 — Decision Signal Tracking. Extract a directional signal
            // from the assistant's response and persist it. Fire-and-forget:
            // never blocks the chat response. Only creates a signal when a
            // clear directional recommendation (buy/sell/reduce/add) is found.
            if (messageId) {
              void extractAndPersistSignal(ui, {
                userId,
                threadId,
                messageId,
                model: resolvedModelId,
                snapshot,
              }).catch((err) =>
                console.warn('[ai] decision signal extraction failed', err),
              );
            }
          }
          const rateLimit = extractRateLimits(response.headers);
          if (rateLimit) {
            try {
              await db
                .delete(schema.providerTests)
                .where(
                  and(
                    eq(schema.providerTests.userId, userId),
                    eq(schema.providerTests.providerId, providerId),
                  ),
                );
              await db.insert(schema.providerTests).values({
                userId,
                providerId,
                ok: true,
                error: null,
                testedAt: new Date().toISOString(),
                rateLimit: rateLimit as { remainingRequests?: number; remainingTokens?: number; resetRequests?: string; resetTokens?: string; } | null,
              });
            } catch (err) {
              console.warn('[ai] failed to save provider test rate limits', err);
            }
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
            console.warn('[ai] applyBudgetDelta failed', err),
          );
          if (env.LOG_PROMPTS) {
            console.info('[ai] finish reason=%s tokens=%o', finishReason, usage);
          }
        } catch (err) {
          // Persistence failures must not crash the stream — log and move on.
          console.error('[ai] persistence/telemetry failed', err);
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
      recordStep('stream_text', { model: resolvedModelId, attempt: attempts });
      const result = await withToolContext(toolContext, () => Promise.resolve(streamText(streamArgs)));
      completeStep('stream_text', 'completed');
      return result;
    } catch (err) {
      lastError = err;
      const decision = classifyStreamError(err);
      if (!decision.fallback) {
        throw err;
      }

      // Fallback! Get next provider from chain
      const chain = userSettings.aiFallbackChain ?? [];
      let nextProviderId: ProviderId | null = null;
      const idx = chain.indexOf(providerId);
      // PERF-05: Use the pre-decrypted BYOK keys hoisted above the loop.
      const stored = decryptedByokKeys;
      for (let i = idx + 1; i < chain.length; i++) {
        const pid = chain[i] as ProviderId;
        const key = stored?.[pid] || (pid === 'google' ? env.GOOGLE_GENERATIVE_AI_API_KEY : undefined);
        if (typeof key === 'string' && key.trim().length > 0) {
          nextProviderId = pid;
          break;
        }
      }

      if (!nextProviderId) {
        throw err;
      }

      console.warn(
        `[ai] Fallback triggered! Provider "${providerId}" failed (${decision.reason}: ${decision.message}). Trying next fallback provider: "${nextProviderId}"`,
      );

      fallbackInfo = makeFallbackPart(
        currentModelOverride ?? `${providerId}:${bareModelId}`,
        decision
      );

      const nextSpec = BYOK_PROVIDERS[nextProviderId];
      if (nextSpec && nextSpec.defaultModels.technical) {
        currentModelOverride = `${nextProviderId}:${nextSpec.defaultModels.technical}`;
      } else {
        currentModelOverride = nextProviderId;
      }
    }
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
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
        GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
        GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
        GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
        AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
        MAX_DAILY_USD: env.MAX_DAILY_USD,
        LOG_PROMPTS: env.LOG_PROMPTS,
      },
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
    console.error('[ai] auto-title (background) failed', err);
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

// ---------------------------------------------------------------------------
// F1 — Decision Signal Tracking helper.
//
// Extracts a directional signal from the assistant's response and persists
// it as a decision_signal row. Fire-and-forget: the caller wraps this in
// void + .catch() so it never blocks or crashes the chat response.
//
// The symbol is resolved from (1) the thread's pinnedSymbol, (2) the user
// message text, or (3) the first symbol found in the snapshot prices.
// The current price comes from the live snapshot.
// ---------------------------------------------------------------------------

async function extractAndPersistSignal(
  uiMessage: UIMessage,
  ctx: {
    userId: string;
    threadId: string;
    messageId: string;
    model: string;
    snapshot: LiveSnapshot;
  },
): Promise<void> {
  // Resolve the symbol from the snapshot prices (first available).
  const symbolEntries = Object.entries(ctx.snapshot.prices);
  if (symbolEntries.length === 0) return; // No price data — can't create a signal.

  // Pick the first symbol that has a price.
  const [symbol, tick] = symbolEntries[0]!;
  if (!tick || typeof tick.mid !== 'number') return;

  const payload = extractDecisionSignal(uiMessage, {
    symbol,
    currentPrice: tick.mid,
    userId: ctx.userId,
    threadId: ctx.threadId,
    messageId: ctx.messageId,
    model: ctx.model,
  });

  if (payload) {
    await createDecisionSignal(payload);
  }
}
