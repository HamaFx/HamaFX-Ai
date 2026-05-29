import { bigint, date, pgTable } from 'drizzle-orm/pg-core';

/**
 * Atomic daily AI-spend counter (Phase 1 hardening §7).
 *
 * Pre-fix the chat route enforced the daily budget by SUM-ing
 * `chat_telemetry.est_cost_usd` and comparing against the cap. Two
 * concurrent requests sitting at 99% of the cap would both pass the check
 * and the user would burn 198% of the budget.
 *
 * This table holds a single row per UTC day with the running estimated
 * spend in cents. `tryReserveBudget()` issues an `UPDATE … WHERE total +
 * est <= cap` so concurrent reservations are serialised by Postgres at
 * row level. `recordTelemetry()` reconciles the counter with the actual
 * cost after the model call, so the running total stays close to the
 * audit `SUM(est_cost_usd)`.
 *
 * One row per day keeps the table tiny (~365 rows / year) and lets us
 * keep `day` as the primary key. There's no `user_id` column — single
 * user, single counter.
 */
export const dailyAiSpend = pgTable('daily_ai_spend', {
  /** UTC calendar day (`YYYY-MM-DD`). */
  day: date('day').primaryKey(),
  /** Running estimated spend in USD cents — see helper docs. */
  totalUsdCents: bigint('total_usd_cents', { mode: 'number' }).notNull().default(0),
});

export type DailyAiSpendRow = typeof dailyAiSpend.$inferSelect;
export type DailyAiSpendInsert = typeof dailyAiSpend.$inferInsert;
