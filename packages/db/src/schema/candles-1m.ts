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

// Phase 8 — `candles_1m` is the persisted 1-minute candle table written by
// the worker's in-process aggregator on bar close. The Vercel
// `/api/market/candles?tf=1m` route reads from here. Higher timeframes
// (5m / 15m / 1h / 4h / 1d) keep coming from BiQuote's `/api/{symbol}/ohlc`
// REST endpoint, cached by the existing data layer.
//
// Retention: pruned to the trailing 14 days by a tail step in the
// `snapshots` nightly job (Phase 8 PR-11). 14d × 3 symbols × 1440 bars =
// 60,480 rows max — trivial.

import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const candles1m = pgTable(
  'candles_1m',
  {
    symbol: text('symbol').notNull(),
    /**
     * Bar open time. Stored as `timestamp with time zone` to match the rest
     * of the schema. Convert from ms epoch in the worker via
     * `new Date(ms)` before insert; convert back via `row.t.getTime()` on
     * read.
     */
    t: timestamp('t', { withTimezone: true }).notNull(),
    o: doublePrecision('o').notNull(),
    h: doublePrecision('h').notNull(),
    l: doublePrecision('l').notNull(),
    c: doublePrecision('c').notNull(),
    /** Real volume — nullable for FX. */
    v: doublePrecision('v'),
    /** Number of ticks that produced this bar. */
    tickVolume: integer('tick_volume').notNull(),
    /** Stable string. Defaults to 'biquote-signalr' from the aggregator. */
    source: text('source').notNull().default('biquote-signalr'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.symbol, t.t] }),
    index('candles_1m_symbol_t_idx').on(t.symbol, t.t),
  ],
);

export type Candle1mRow = typeof candles1m.$inferSelect;
export type Candle1mInsert = typeof candles1m.$inferInsert;
