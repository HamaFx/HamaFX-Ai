// Per-model cost estimation + the daily-budget guardrail.
//
// We don't try to be exact — providers shift prices and the gateway adds a
// markup we can't introspect at runtime. The numbers here are **upper bounds**
// from public list prices (Q1 2026), so the budget check stays conservative.
//
// Source of truth for the actual deployment ceiling is the env var
// `MAX_DAILY_USD`. The check fires BEFORE we invoke the model.
//
// Phase 1 hardening (§7) — `tryReserveBudget()` replaces the old
// `enforceDailyBudget()` "sum-then-compare" pattern. The previous flow read
// `SUM(est_cost_usd)`, decided, then ran the model; two concurrent requests
// at 99% of the cap could both pass the gate. The new flow issues an
// atomic `UPDATE` against `daily_ai_spend` that only succeeds when the
// reservation fits under the cap, so concurrent callers serialise at the
// row-level lock. `recordTelemetry` reconciles the counter with the actual
// post-call cost.

import { getDb, schema } from '@hamafx/db';
import { sql } from 'drizzle-orm';

interface ModelRate {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
}

/**
 * Conservative per-model rates. Update when the AI Gateway price page changes
 * (https://vercel.com/dashboard/ai-gateway/models). When a model isn't here
 * we use the highest known rate as a safety default.
 */
const RATES: Record<string, ModelRate> = {
  'openai/gpt-4.1': { inputPerM: 5, outputPerM: 15 },
  'openai/gpt-4.1-mini': { inputPerM: 0.4, outputPerM: 1.6 },
  'openai/gpt-4o': { inputPerM: 5, outputPerM: 15 },
  'anthropic/claude-3.7-sonnet': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-sonnet-4': { inputPerM: 3, outputPerM: 15 },
  'google/gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'google/gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'google/gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10 },
};

const FALLBACK_RATE: ModelRate = { inputPerM: 5, outputPerM: 15 };

/**
 * Default per-turn estimate used when `tryReserveBudget()` is called without
 * an explicit number. Conservative — tuned so a typical chat turn lands
 * under this estimate so the post-call reconcile usually rebates a small
 * amount. Override on a per-call basis when a turn is known to be cheap
 * (e.g. title generation) or expensive.
 */
export const DEFAULT_TURN_ESTIMATE_USD = 0.01;

/** Estimate USD cost from token counts. Always >= 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? FALLBACK_RATE;
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Sum of `est_cost_usd` from `chat_telemetry` for the current UTC day.
 * Returns 0 if the table is empty.
 *
 * This still exists as the audit query for `/settings/usage`. The
 * authoritative running counter for the budget gate is
 * `daily_ai_spend.total_usd_cents`.
 */
export async function dailySpendUsd(now = new Date()): Promise<number> {
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.chatTelemetry.estCostUsd}), 0)` })
    .from(schema.chatTelemetry)
    .where(sql`${schema.chatTelemetry.createdAt} >= ${startUtc}`);
  return Number(rows[0]?.total ?? 0);
}

/**
 * Read the authoritative running counter for today. Useful for
 * `/settings/usage` and the audit reconciliation log.
 */
export async function reservedSpendUsd(now = new Date()): Promise<number> {
  const day = utcDayKey(now);
  const rows = await getDb()
    .select({ cents: schema.dailyAiSpend.totalUsdCents })
    .from(schema.dailyAiSpend)
    .where(sql`${schema.dailyAiSpend.day} = ${day}`)
    .limit(1);
  return Number(rows[0]?.cents ?? 0) / 100;
}

export interface BudgetReservation {
  /** True iff the reservation fits under the cap (and the row was updated). */
  ok: boolean;
  /** Running total **after** the reservation (or current total if `ok=false`), in USD. */
  spent: number;
  /** Cap in USD as seen at the time of the reservation. */
  max: number;
}

/**
 * Atomically reserve `estimatedUsd` against today's running counter. Returns
 * `{ ok: true }` iff the reservation fits under `capUsd`; the chat turn may
 * proceed. Returns `{ ok: false }` (no row updated) when the reservation
 * would exceed the cap; the caller MUST NOT invoke the model.
 *
 * Implementation: a single `INSERT … ON CONFLICT DO UPDATE WHERE …` so the
 * cap check, increment, and write are one statement under one row lock.
 * Concurrent callers at 99% of the cap will see exactly one success.
 *
 * The post-call `recordTelemetry()` reconciles the actual cost via
 * `applyBudgetDelta()`.
 */
export async function tryReserveBudget(
  estimatedUsd: number,
  capUsd: number,
  now = new Date(),
): Promise<BudgetReservation> {
  const day = utcDayKey(now);
  const estCents = Math.max(0, Math.ceil(estimatedUsd * 100));
  const capCents = Math.max(0, Math.ceil(capUsd * 100));

  // The UPDATE branch's WHERE clause keeps the increment from blowing past
  // the cap. The INSERT branch only runs when no row exists yet for today;
  // we still gate it on the cap so a fresh day starting at 0 can't be
  // jumped past in one shot if the estimate is somehow > capUsd.
  if (estCents > capCents) {
    const spent = await reservedSpendUsd(now);
    return { ok: false, spent, max: capUsd };
  }

  const rows = await getDb().execute<{ total_usd_cents: number | string }>(
    sql`
      INSERT INTO daily_ai_spend (day, total_usd_cents)
      VALUES (${day}, ${estCents})
      ON CONFLICT (day) DO UPDATE
        SET total_usd_cents = daily_ai_spend.total_usd_cents + ${estCents}
        WHERE daily_ai_spend.total_usd_cents + ${estCents} <= ${capCents}
      RETURNING total_usd_cents
    `,
  );
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  const first = (list as Array<{ total_usd_cents: number | string }>)[0];
  if (!first) {
    const spent = await reservedSpendUsd(now);
    return { ok: false, spent, max: capUsd };
  }
  return { ok: true, spent: Number(first.total_usd_cents) / 100, max: capUsd };
}

/**
 * Reconcile a previously-reserved estimate with the actual post-call cost.
 * Pass the signed delta in USD: positive when the call cost more than we
 * reserved (correct an underestimate), negative when it cost less (release
 * the over-reservation).
 *
 * Best-effort: the audit query `dailySpendUsd()` is still authoritative
 * for billing. This counter is only used to gate the next reservation, so
 * a small drift between the two never matters in practice.
 */
export async function applyBudgetDelta(deltaUsd: number, now = new Date()): Promise<void> {
  if (!Number.isFinite(deltaUsd) || deltaUsd === 0) return;
  const day = utcDayKey(now);
  const cents = Math.round(deltaUsd * 100);
  if (cents === 0) return;
  // GREATEST(0, …) keeps the counter clamped on releases that are bigger
  // than the reservation (e.g. a tool-call that errored before any tokens
  // were billed). The cap check is the caller's responsibility — by the
  // time we're applying a post-call delta, the reservation already passed.
  await getDb().execute(
    sql`
      INSERT INTO daily_ai_spend (day, total_usd_cents)
      VALUES (${day}, GREATEST(0, ${cents}))
      ON CONFLICT (day) DO UPDATE
        SET total_usd_cents = GREATEST(0, daily_ai_spend.total_usd_cents + ${cents})
    `,
  );
}

/**
 * Throw if today's spend has already crossed `maxUsd`. This is the legacy
 * path — kept as a no-reservation pre-check that callers (e.g. the title
 * generator) use to gate on whether the budget has any room left at all.
 *
 * The chat turn itself uses `tryReserveBudget()` so concurrent callers
 * can't both pass at 99% of the cap.
 */
export async function enforceDailyBudget(maxUsd: number): Promise<{ spent: number; max: number }> {
  const spent = await reservedSpendUsd();
  if (spent >= maxUsd) {
    throw new BudgetExceededError(spent, maxUsd);
  }
  return { spent, max: maxUsd };
}

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  constructor(
    readonly spent: number,
    readonly max: number,
  ) {
    super(`Daily AI budget exceeded: spent $${spent.toFixed(4)} / $${max.toFixed(2)}`);
    this.name = 'BudgetExceededError';
  }
}
