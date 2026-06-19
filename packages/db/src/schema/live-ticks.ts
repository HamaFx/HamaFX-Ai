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

// Phase 8 — `live_ticks` is a tiny snapshot table the worker UPSERTs at
// ≤1 Hz per symbol from the BiQuote SignalR consumer. Three rows total
// (one per supported symbol). The Vercel `/api/market/price` route reads
// this table first and only falls through to a REST provider if the row
// is missing or stale (≥60 s old).
//
// Design choice (spec §3.3): we deliberately keep this a snapshot table,
// not a tick history. Tick history would balloon Supabase Free's 500 MB
// budget for marginal value — we already store 1m candles in
// `candles_1m`, which covers the replay use cases.

import { doublePrecision, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const liveTicks = pgTable('live_ticks', {
  /** 'XAUUSD' | 'EURUSD' | 'GBPUSD'. PK so UPSERT collapses to one row per symbol. */
  symbol: text('symbol').primaryKey(),
  bid: doublePrecision('bid').notNull(),
  ask: doublePrecision('ask').notNull(),
  /** Pre-computed mid, written by the consumer so readers don't recompute. */
  mid: doublePrecision('mid').notNull(),
  /**
   * Tick wall-clock time. Stored as `timestamp with time zone`; convert from
   * the worker's `Date.now()` via `new Date(ms)` before insert and back via
   * `row.ts.getTime()` on read.
   */
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  /**
   * Where this tick came from. Stable strings, not an enum, because we
   * want to introduce new sources without a schema migration:
   *   - 'biquote-signalr'  — preferred path (worker hub consumer)
   *   - 'biquote-rest'     — REST polling fallback
   *   - 'finnhub-rest'     — fallback on BiQuote outage
   *   - 'alpha-vantage'    — last-resort
   */
  source: text('source').notNull(),
  /** Drizzle-managed; updated automatically on every UPSERT (see SQL migration). */
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type LiveTickRow = typeof liveTicks.$inferSelect;
export type LiveTickInsert = typeof liveTicks.$inferInsert;
