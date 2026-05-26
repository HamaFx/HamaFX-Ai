// Per-model cost estimation + the daily-budget guardrail.
//
// We don't try to be exact — providers shift prices and the gateway adds a
// markup we can't introspect at runtime. The numbers here are **upper bounds**
// from public list prices (Q1 2026), so the budget check stays conservative.
//
// Source of truth for the actual deployment ceiling is the env var
// `MAX_DAILY_USD`. The check fires BEFORE we invoke the model.

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

/** Estimate USD cost from token counts. Always >= 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? FALLBACK_RATE;
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}

/**
 * Sum of `est_cost_usd` from `chat_telemetry` for the current UTC day.
 * Returns 0 if the table is empty.
 */
export async function dailySpendUsd(now = new Date()): Promise<number> {
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.chatTelemetry.estCostUsd}), 0)` })
    .from(schema.chatTelemetry)
    .where(sql`${schema.chatTelemetry.createdAt} >= ${startUtc.toISOString()}`);
  return Number(rows[0]?.total ?? 0);
}

/**
 * Throw if today's spend has already crossed `maxUsd`. Called at the very top
 * of `/api/chat` before any model invocation so the budget can't be busted by
 * a pathological tool-loop.
 */
export async function enforceDailyBudget(maxUsd: number): Promise<{ spent: number; max: number }> {
  const spent = await dailySpendUsd();
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
