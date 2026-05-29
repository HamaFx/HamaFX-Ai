// Phase 7c — plan-then-act.
//
// For analytical turns (`routing.planRequired === true`) we run a tiny
// pre-step that produces a plan as JSON: `{ steps: string[], expectedTools:
// string[], rationale: string }`. The plan is persisted as an assistant
// message with a single `data-plan` part so the chat surface can render
// it as a collapsible "Thinking" UI part right above the actual answer.
//
// The planner uses the cheap summary model and is hard-budget-guarded —
// when the daily AI budget is exhausted, OR the LLM call fails, we fall
// back to a deterministic plan synthesised from the routing decision.
// This means the chat UX never regresses on a planner side-effect bug.
//
// The planner is intentionally NOT invoked from inside the main
// `streamText` call. Doing it as a separate `generateText` keeps the
// roundtrip auditable and lets us cache the plan on the message row
// independently of the model's tool-loop output.

import { getDb, schema } from '@hamafx/db';
import type { ServerEnv, UserPlanPart } from '@hamafx/shared';
import { generateText, type UIMessage } from 'ai';

import { dailySpendUsd } from './cost';
import { resolveModel } from './model';
import { maybeGetToolContext } from './tool-context';
import type { RoutingDecision } from './routing';

export type PlannerEnv = Pick<
  ServerEnv,
  | 'AI_GATEWAY_API_KEY'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'GOOGLE_VERTEX_PROJECT'
  | 'GOOGLE_VERTEX_LOCATION'
  | 'GOOGLE_APPLICATION_CREDENTIALS_JSON'
  | 'GOOGLE_APPLICATION_CREDENTIALS'
  | 'AI_SUMMARY_MODEL'
  | 'AI_DEFAULT_MODEL'
  | 'MAX_DAILY_USD'
  | 'LOG_PROMPTS'
>;

export interface RunPlannerArgs {
  threadId: string;
  /** Latest user message — drives the planner prompt. */
  userMessage: UIMessage;
  routing: RoutingDecision;
  env: PlannerEnv;
  signal?: AbortSignal;
}

export interface PlanResult {
  plan: UserPlanPart;
  /** Persisted assistant message id; null when the planner skipped. */
  messageId: string | null;
  /** Token usage for cost telemetry. 0 when fallback was used. */
  inputTokens: number;
  outputTokens: number;
  /** ms elapsed end-to-end. */
  ms: number;
  source: 'llm' | 'fallback';
  /** When `source === 'fallback'`, why we fell back. */
  reason?: 'budget' | 'failed' | 'not_required';
}

const SYSTEM_PROMPT =
  "You produce a short JSON plan for a trading copilot turn. Output JSON ONLY: { \"steps\": [\"<sentence>\", ...], \"expectedTools\": [\"tool_name\", ...], \"rationale\": \"<one-line>\" }. 3-5 steps maximum. No greetings, no preamble, no markdown fences.";

const FALLBACK_STEPS_BY_DOMAIN: Record<RoutingDecision['domain'], string[]> = {
  fundamental: [
    'Pull the upcoming events for the relevant currency window.',
    'Search recent news for catalysts.',
    'Cross-check sentiment and rate-implied moves.',
    'State a scenario read with explicit invalidation.',
  ],
  technical: [
    'Pull candles for the requested timeframe(s).',
    'Compute structure (swings + BOS/CHoCH) and ATR.',
    'Identify the active bias and the level that invalidates it.',
    'Name a setup with entry / stop / target geometry.',
  ],
  summary: [
    'List the most relevant items from the requested view.',
    'Tag any high-impact items.',
    'Restate the active bias if the user has one pinned.',
  ],
  vision: [
    'Run the vision model on the attached chart image.',
    'Cross-check the inferred levels against live data.',
    'Surface the structured output via the chart-annotation flow.',
  ],
  generic: [
    "Identify whether the user wants market data, journal action, or alerts.",
    'Pick the matching tool and execute.',
  ],
};

/**
 * Run the planner. When `routing.planRequired === false`, returns a
 * `not_required` skip without writing anything. Otherwise produces and
 * persists a plan part as an assistant message.
 */
export async function runPlanner(args: RunPlannerArgs): Promise<PlanResult> {
  const startedAt = Date.now();

  if (!args.routing.planRequired) {
    return {
      plan: emptyPlan(args.routing),
      messageId: null,
      inputTokens: 0,
      outputTokens: 0,
      ms: 0,
      source: 'fallback',
      reason: 'not_required',
    };
  }

  // Hard budget guard — never spend on a planner side-effect when the
  // daily ceiling has been crossed. Fall back to deterministic copy.
  //
  // Phase 3 hardening §4 — read the cached snapshot from the per-turn
  // tool context when available so the planner doesn't double-up on
  // the title generator's `dailySpendUsd()` query.
  let llmAllowed = true;
  try {
    const ctx = maybeGetToolContext();
    const spent = ctx ? ctx.budget.spent : await dailySpendUsd();
    if (spent >= args.env.MAX_DAILY_USD) llmAllowed = false;
  } catch {
    llmAllowed = false;
  }

  if (!llmAllowed) {
    const plan = deterministicPlan(args.routing, args.userMessage);
    const messageId = await persistPlan(args.threadId, plan);
    return {
      plan,
      messageId,
      inputTokens: 0,
      outputTokens: 0,
      ms: Date.now() - startedAt,
      source: 'fallback',
      reason: 'budget',
    };
  }

  const userText = extractText(args.userMessage).slice(0, 1500);
  const prompt = [
    `Routing domain: ${args.routing.domain}.`,
    `Routing rationale: ${args.routing.rationale}.`,
    `User asked: ${userText}`,
  ].join('\n');

  try {
    const modelId =
      args.env.AI_SUMMARY_MODEL ?? args.env.AI_DEFAULT_MODEL ?? 'google-vertex/gemini-2.5-flash';
    const callArgs: Parameters<typeof generateText>[0] = {
      model: resolveModel(modelId, args.env),
      system: SYSTEM_PROMPT,
      prompt,
    };
    if (args.signal) callArgs.abortSignal = args.signal;
    const { text, usage } = await generateText(callArgs);

    const parsed = parseModelJson(text);
    if (!parsed) {
      const fallback = deterministicPlan(args.routing, args.userMessage);
      const messageId = await persistPlan(args.threadId, fallback);
      return {
        plan: fallback,
        messageId,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        ms: Date.now() - startedAt,
        source: 'fallback',
        reason: 'failed',
      };
    }

    const plan: UserPlanPart = {
      type: 'data-plan',
      domain: args.routing.domain,
      steps: parsed.steps,
      expectedTools: parsed.expectedTools,
      rationale: parsed.rationale,
      modelId,
      createdAt: Date.now(),
    };
    const messageId = await persistPlan(args.threadId, plan);
    return {
      plan,
      messageId,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      ms: Date.now() - startedAt,
      source: 'llm',
    };
  } catch (err) {
    if (args.env.LOG_PROMPTS) console.warn('[planner] LLM failed, falling back', err);
    const fallback = deterministicPlan(args.routing, args.userMessage);
    const messageId = await persistPlan(args.threadId, fallback);
    return {
      plan: fallback,
      messageId,
      inputTokens: 0,
      outputTokens: 0,
      ms: Date.now() - startedAt,
      source: 'fallback',
      reason: 'failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Persistence — the plan is stored as a system-role message with a single
// `data-plan` part so it streams into the next thread fetch and can be
// rendered by the chat surface alongside other messages.
// ---------------------------------------------------------------------------

async function persistPlan(threadId: string, plan: UserPlanPart): Promise<string> {
  const inserted = await getDb()
    .insert(schema.chatMessages)
    .values({
      threadId,
      // Use 'system' role so this message doesn't count as an assistant
      // turn for budget / telemetry purposes — it's purely a UI-level
      // breadcrumb of the planner's output. It's still chronologically
      // before the assistant's main answer.
      role: 'system',
      content: plan.rationale,
      parts: [plan],
    })
    .returning({ id: schema.chatMessages.id });
  return inserted[0]!.id;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function emptyPlan(routing: RoutingDecision): UserPlanPart {
  return {
    type: 'data-plan',
    domain: routing.domain,
    steps: [],
    expectedTools: [],
    rationale: 'No plan emitted (planRequired=false).',
    modelId: '',
    createdAt: Date.now(),
  };
}

function deterministicPlan(routing: RoutingDecision, userMessage: UIMessage): UserPlanPart {
  return {
    type: 'data-plan',
    domain: routing.domain,
    steps: FALLBACK_STEPS_BY_DOMAIN[routing.domain],
    expectedTools: [],
    rationale: `Domain ${routing.domain} — using deterministic checklist (planner skipped). User: ${extractText(
      userMessage,
    ).slice(0, 200)}`,
    modelId: '',
    createdAt: Date.now(),
  };
}

function extractText(m: UIMessage): string {
  let out = '';
  for (const p of m.parts ?? []) {
    if (
      p !== null &&
      typeof p === 'object' &&
      'type' in (p as Record<string, unknown>) &&
      (p as { type: unknown }).type === 'text' &&
      typeof (p as { text?: unknown }).text === 'string'
    ) {
      out += `${(p as { text: string }).text}\n`;
    }
  }
  return out.trim();
}

interface ParsedModelJson {
  steps: string[];
  expectedTools: string[];
  rationale: string;
}

function parseModelJson(text: string): ParsedModelJson | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as { steps?: unknown; expectedTools?: unknown; rationale?: unknown };
  const steps = Array.isArray(obj.steps)
    ? obj.steps.filter((s): s is string => typeof s === 'string').slice(0, 6)
    : [];
  const expectedTools = Array.isArray(obj.expectedTools)
    ? obj.expectedTools.filter((s): s is string => typeof s === 'string').slice(0, 8)
    : [];
  const rationale =
    typeof obj.rationale === 'string' ? obj.rationale.slice(0, 500) : '(no rationale)';
  if (steps.length === 0) return null;
  return { steps, expectedTools, rationale };
}
