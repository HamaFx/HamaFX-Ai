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

// Per-model cost estimation + the daily-budget guardrail.
//
// We don't try to be exact — providers shift prices and the gateway adds a
// markup we can't introspect at runtime. The numbers here are **upper bounds**
// from public list prices (Q1 2026), so the budget check stays conservative.
//
// Source of truth for the actual deployment ceiling is the env var
// `MAX_DAILY_USD`. The check fires BEFORE we invoke the model.
//
// Phase A: budget is now per-user. All functions accept `userId` and scope
// queries to the user's row in `daily_ai_spend` (composite PK: user_id, day).

import { getDb, schema } from '@hamafx/db';
import { sql } from 'drizzle-orm';

interface ModelRate {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
}

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
 * Sum of `est_cost_usd` from `chat_telemetry` for the current UTC day,
 * scoped to a specific user. Returns 0 if no rows exist.
 */
export async function dailySpendUsd(userId: string, now = new Date()): Promise<number> {
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.chatTelemetry.estCostUsd}), 0)` })
    .from(schema.chatTelemetry)
    .where(
      sql`${schema.chatTelemetry.userId} = ${userId} AND ${schema.chatTelemetry.createdAt} >= ${startUtc}`,
    );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Read the authoritative running counter for today for a specific user.
 */
export async function reservedSpendUsd(userId: string, now = new Date()): Promise<number> {
  const day = utcDayKey(now);
  const rows = await getDb()
    .select({ cents: schema.dailyAiSpend.totalUsdCents })
    .from(schema.dailyAiSpend)
    .where(
      sql`${schema.dailyAiSpend.userId} = ${userId} AND ${schema.dailyAiSpend.day} = ${day}`,
    )
    .limit(1);
  return Number(rows[0]?.cents ?? 0) / 100;
}

export interface BudgetReservation {
  ok: boolean;
  spent: number;
  max: number;
}

/**
 * Atomically reserve `estimatedUsd` against today's running counter for
 * the given user. Returns `{ ok: true }` iff the reservation fits under
 * `capUsd`. Phase A: PK is now (user_id, day).
 */
export async function tryReserveBudget(
  userId: string,
  estimatedUsd: number,
  capUsd: number,
  now = new Date(),
): Promise<BudgetReservation> {
  const day = utcDayKey(now);
  const estCents = Math.max(0, Math.ceil(estimatedUsd * 100));
  const capCents = Math.max(0, Math.ceil(capUsd * 100));

  if (estCents > capCents) {
    const spent = await reservedSpendUsd(userId, now);
    return { ok: false, spent, max: capUsd };
  }

  const rows = await getDb().execute<{ total_usd_cents: number | string }>(
    sql`
      INSERT INTO daily_ai_spend (user_id, day, total_usd_cents)
      VALUES (${userId}, ${day}, ${estCents})
      ON CONFLICT (user_id, day) DO UPDATE
        SET total_usd_cents = daily_ai_spend.total_usd_cents + ${estCents}
        WHERE daily_ai_spend.total_usd_cents + ${estCents} <= ${capCents}
      RETURNING total_usd_cents
    `,
  );
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  const first = (list as Array<{ total_usd_cents: number | string }>)[0];
  if (!first) {
    const spent = await reservedSpendUsd(userId, now);
    return { ok: false, spent, max: capUsd };
  }
  return { ok: true, spent: Number(first.total_usd_cents) / 100, max: capUsd };
}

/**
 * Reconcile a previously-reserved estimate with the actual post-call cost.
 * Phase A: scoped to userId.
 */
export async function applyBudgetDelta(
  userId: string,
  deltaUsd: number,
  now = new Date(),
): Promise<void> {
  if (!Number.isFinite(deltaUsd) || deltaUsd === 0) return;
  const day = utcDayKey(now);
  const cents = Math.round(deltaUsd * 100);
  if (cents === 0) return;
  await getDb().execute(
    sql`
      INSERT INTO daily_ai_spend (user_id, day, total_usd_cents)
      VALUES (${userId}, ${day}, GREATEST(0, ${cents}))
      ON CONFLICT (user_id, day) DO UPDATE
        SET total_usd_cents = GREATEST(0, daily_ai_spend.total_usd_cents + ${cents})
    `,
  );
}

/**
 * Throw if today's spend has already crossed `maxUsd` for the given user.
 */
export async function enforceDailyBudget(
  userId: string,
  maxUsd: number,
): Promise<{ spent: number; max: number }> {
  const spent = await reservedSpendUsd(userId);
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