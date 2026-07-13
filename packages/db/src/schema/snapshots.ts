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

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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
    tenantId: text('tenant_id').default(sql`'__system__'`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('snapshots_symbol_kind_asof_idx').on(t.symbol, t.kind, t.asOf),
    // Phase 3 §15 — prevents duplicate snapshots from overlapping cron runs.
    unique('snapshots_symbol_kind_asof_uk').on(t.symbol, t.kind, t.asOf),
  ],
);
