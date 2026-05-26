import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Daily / weekly / monthly snapshots: HLOC, pivots, key levels, ATR. Computed
 * by /api/cron/snapshots and read by the agent's context payload + chart UI.
 */
export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbol: text('symbol').notNull(),
    /** "daily" | "weekly" | "monthly" */
    kind: text('kind').notNull(),
    /** UTC midnight of the period this snapshot describes. */
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    /** Free-form JSON: { high, low, open, close, pivot, r1, s1, atr, ... } */
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('snapshots_symbol_kind_asof_idx').on(t.symbol, t.kind, t.asOf),
  ],
);
