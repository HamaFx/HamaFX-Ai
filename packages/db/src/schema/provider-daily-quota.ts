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

import { date, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * Phase A RL-2 — Shared daily quota counter for providers with a daily cap
 * (e.g. free-tier providers with 800 req/day).
 *
 * Replaces module-global `dailyCount`/`dailyResetAt` that were per-instance
 * and lost on cold start. The atomic upsert ensures correctness across
 * all Vercel function instances and the worker.
 */
export const providerDailyQuota = pgTable(
  'provider_daily_quota',
  {
    provider: text('provider').notNull(),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.provider, table.day] })],
);
