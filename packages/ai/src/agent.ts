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
} from 'ai';

import { buildLiveSnapshot } from './context';
import {
  applyBudgetDelta,
  BudgetExceededError,
  DEFAULT_TURN_ESTIMATE_USD,
  estimateCostUsd,
  tryReserveBudget,
} from './cost';
import { compactThread } from './memory/thread-summary';
import { resolveModel } from './model';
import {
  appendAssistantMessage,
  appendUserMessage,
  getThread,
  listMessages,
  recordTelemetry,
  updateThreadTitle,
} from './persistence';
import { runPlanner } from './planner';
import { buildSystemPrompt } from './prompt/system';
import { routeTurn, type RoutingDecision } from './routing';
import { generateTitle } from './title';
import { withToolContext, type ToolContext } from './tool-context';
import { tools } from './tools';
import { enforceCitations } from './verification';
import { waitUntil } from './wait-until';

export interface RunChatArgs {
  threadId: string;
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
    | 'AI_TITLE_MODEL'
    | 'AI_VISION_MODEL'
    | 'AI_FUNDAMENTAL_MODEL'
    | 'AI_TECHNICAL_MODEL'
    | 'AI_SUMMARY_MODEL'
    | 'MAX_DAILY_USD'
    | 'MAX_TOOL_ITERATIONS'
    | 'LOG_PROMPTS'
  >;
  /** Optional model override (e.g. coming from thread.modelOverride). */
  modelOverride?: string | null;
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
  const { threadId, userMessage, env, modelOverride, signal } = args;
  const startedAt = Date.now();

  // 1) Hard ceiling — atomic reservation against today's running counter.
  //    Two concurrent turns sitting at 99% of the cap can't both pass:
  //    Postgres serialises the row-level UPDATE so exactly one wins. A
  //    `recordTelemetry` call at the end reconciles the reservation with
  //    the actual cost (delta between estimated and observed).
  const reservation = await tryReserveBudget(DEFAULT_TURN_ESTIMATE_USD, env.MAX_DAILY_USD);
  if (!reservation.ok) {
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }
  const reservedUsd = DEFAULT_TURN_ESTIMATE_USD;

  // 2) Persist the user message before we start streaming. If the model fails
  //    we still want the prompt in history so retries can resume.
  await appendUserMessage(threadId, userMessage);

  // 3) Load history + ambient snapshot in parallel; THEN apply rolling-summary
  //    compaction once we know the message count.
  const [history, snapshot] = await Promise.all([
    listMessages(threadId, 60),
    buildLiveSnapshot(signal ? { signal } : {}),
  ]);

  const compactArgs: Parameters<typeof compactThread>[0] = {
    threadId,
    history,
    env,
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
          parts: (m.parts ?? [{ type: 'text', text: m.content }]) as UIMessage['parts'],
        }) as UIMessage,
    ),
  );

  // 4) Domain-based model routing — picks the best model for this turn.
  const routingArgs: Parameters<typeof routeTurn>[0] = { userMessage, env };
  if (modelOverride !== undefined) routingArgs.modelOverride = modelOverride;
  const routing: RoutingDecision = routeTurn(routingArgs);

  // Resolve the chosen model. If it fails (e.g. an env var pointed at a
  // model id that doesn't exist on the configured transport), fall back
  // to AI_DEFAULT_MODEL rather than crashing the whole turn. The user
  // sees the answer; we log the fall-back for visibility.
  let modelId = routing.modelId;
  let model: ReturnType<typeof resolveModel>;
  try {
    model = resolveModel(modelId, env);
  } catch (err) {
    console.warn(
      `[ai] resolve(${modelId}) failed (${err instanceof Error ? err.message : 'unknown'}); falling back to AI_DEFAULT_MODEL=${env.AI_DEFAULT_MODEL}`,
    );
    modelId = env.AI_DEFAULT_MODEL;
    model = resolveModel(modelId, env);
  }

  // 4b) Plan-then-act (Phase 7c). Runs only when `routing.planRequired`
  //     is true (fundamental + technical domains today). The planner
  //     persists a `data-plan` system-message right before the streaming
  //     turn so the chat surface renders a collapsible "Thinking" pill
  //     above the assistant's answer. Failures fall back deterministically
  //     and never block the main streamText call.
  let plannerStartedAt = 0;
  let plannerResult: Awaited<ReturnType<typeof runPlanner>> | null = null;
  if (routing.planRequired) {
    plannerStartedAt = Date.now();
    try {
      plannerResult = await runPlanner({
        threadId,
        userMessage,
        routing,
        env: {
          AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
          GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
          GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
          GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
          GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
          GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
          AI_SUMMARY_MODEL: env.AI_SUMMARY_MODEL,
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
        threadId,
        messageId: plannerResult.messageId,
        model: env.AI_SUMMARY_MODEL ?? env.AI_DEFAULT_MODEL,
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
  const baseSystem = buildSystemPrompt(snapshot);
  const systemPrompt = compaction.extraSystem
    ? `${compaction.extraSystem}\n\n${baseSystem}`
    : baseSystem;

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
    env: {
      AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
      GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
      GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
      GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
      AI_DEFAULT_MODEL: env.AI_DEFAULT_MODEL,
      AI_VISION_MODEL: env.AI_VISION_MODEL ?? 'google-vertex/gemini-2.5-pro',
      AI_SUMMARY_MODEL: env.AI_SUMMARY_MODEL,
      AI_EMBEDDING_MODEL: 'openai/text-embedding-3-small',
      MAX_DAILY_USD: env.MAX_DAILY_USD,
      LOG_PROMPTS: env.LOG_PROMPTS,
    },
    signal: signal ?? null,
    // The reservation we just took is the freshest budget snapshot we
    // can offer. Helpers that need a stricter "have we crossed the
    // cap?" probe still hit the DB.
    budget: { spent: reservation.spent, max: env.MAX_DAILY_USD },
  };

  if (env.LOG_PROMPTS) {
    console.info(
      '[ai] routing domain=%s model=%s plan=%s rationale=%s',
      routing.domain,
      modelId,
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
    threadId,
    messageId: null,
    model: modelId,
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

  const streamArgs: Parameters<typeof streamText>[0] = {
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
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

          const ui: UIMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            parts,
          };
          ({ messageId } = await appendAssistantMessage(threadId, ui));
        }
        await recordTelemetry({
          threadId,
          messageId,
          model: modelId,
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
          modelId,
          usage?.inputTokens ?? 0,
          usage?.outputTokens ?? 0,
        );
        await applyBudgetDelta(actualCost - reservedUsd).catch((err) =>
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
      waitUntil(runAutoTitleBackground({ threadId, env, signal: signal ?? null }));
    },
  };
  if (signal) streamArgs.abortSignal = signal;

  // Phase 3 hardening §1 — wrap the `streamText` invocation in a
  // `withToolContext` scope so every tool's `execute` callback (and
  // every `onStepFinish` / `onFinish` hook) inherits the context via
  // AsyncLocalStorage. The synchronous return is fine: AsyncLocalStorage
  // tracks the async-hook chain captured when work is scheduled, so
  // promises chained off this `run()` keep the context even after we
  // return the stream result to the caller.
  const result = withToolContext(toolContext, () => Promise.resolve(streamText(streamArgs)));
  return result;
}

/**
 * Slow tail of `onFinish` (Phase 2 hardening §8). Runs the auto-title
 * generator on first turn and persists the result; failures are logged
 * but never crash the stream because the response is already closed by
 * the time we reach this code.
 */
async function runAutoTitleBackground(args: {
  threadId: string;
  env: RunChatArgs['env'];
  signal: AbortSignal | null;
}): Promise<void> {
  const { threadId, env, signal } = args;
  try {
    const thread = await getThread(threadId);
    if (!thread || thread.title !== null) return;
    const all = await listMessages(threadId, 50);
    const firstUser = (all.find((m) => m.role === 'user')?.content ?? '').slice(0, 1024);
    const firstAssistant = (all.find((m) => m.role === 'assistant')?.content ?? '').slice(0, 1024);
    if (firstUser.length === 0 || firstAssistant.length === 0) return;

    const titleStartedAt = Date.now();
    const titleArgs: Parameters<typeof generateTitle>[0] = {
      threadId,
      firstUser,
      firstAssistant,
      env: {
        AI_GATEWAY_API_KEY: env.AI_GATEWAY_API_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: env.GOOGLE_GENERATIVE_AI_API_KEY,
        GOOGLE_VERTEX_PROJECT: env.GOOGLE_VERTEX_PROJECT,
        GOOGLE_VERTEX_LOCATION: env.GOOGLE_VERTEX_LOCATION,
        GOOGLE_APPLICATION_CREDENTIALS_JSON: env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
        GOOGLE_APPLICATION_CREDENTIALS: env.GOOGLE_APPLICATION_CREDENTIALS,
        AI_TITLE_MODEL: env.AI_TITLE_MODEL,
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
      threadId,
      messageId: null,
      model: env.AI_TITLE_MODEL,
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
