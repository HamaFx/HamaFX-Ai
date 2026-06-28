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

import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
    dealerLong: bigint('dealer_long', { mode: 'number' }),
    dealerShort: bigint('dealer_short', { mode: 'number' }),
    assetLong: bigint('asset_long', { mode: 'number' }),
    assetShort: bigint('asset_short', { mode: 'number' }),
    leveragedLong: bigint('leveraged_long', { mode: 'number' }),
    leveragedShort: bigint('leveraged_short', { mode: 'number' }),
    otherLong: bigint('other_long', { mode: 'number' }),
    otherShort: bigint('other_short', { mode: 'number' }),
    /** Provider id, currently always 'cftc'. */
    source: text('source').notNull(),
    /** Full provider row, kept for debugging and future column additions. */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('cot_reports_symbol_date_idx').on(t.symbol, t.reportDate)],
);
