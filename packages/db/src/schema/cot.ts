import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * CFTC Commitment-of-Traders weekly snapshots, one row per
 * (symbol, report_date). Populated by `/api/cron/cot` on Friday evenings.
 *
 * `id` is `cftc:<symbol>:<YYYY-MM-DD>` — deterministic so re-runs are
 * idempotent under ON CONFLICT (id) DO UPDATE.
 *
 * Trader buckets follow the CFTC Disaggregated Futures-Only report:
 *   - dealer       (commercial / hedger)
 *   - asset        (asset manager / institutional)
 *   - leveraged    (leveraged funds; the speculative cohort)
 *   - other        (other reportables)
 *
 * Each bucket gets long + short positions; the agent computes `net = long - short`.
 */
export const cotReports = pgTable(
  'cot_reports',
  {
    id: text('id').primaryKey(),
    /** "XAUUSD" | "EURUSD" | "GBPUSD" — kept as text. */
    symbol: text('symbol').notNull(),
    reportDate: timestamp('report_date', { withTimezone: true }).notNull(),
    dealerLong: integer('dealer_long'),
    dealerShort: integer('dealer_short'),
    assetLong: integer('asset_long'),
    assetShort: integer('asset_short'),
    leveragedLong: integer('leveraged_long'),
    leveragedShort: integer('leveraged_short'),
    otherLong: integer('other_long'),
    otherShort: integer('other_short'),
    /** Provider id, currently always 'cftc'. */
    source: text('source').notNull(),
    /** Full provider row, kept for debugging and future column additions. */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cot_reports_symbol_date_idx').on(t.symbol, t.reportDate)],
);
