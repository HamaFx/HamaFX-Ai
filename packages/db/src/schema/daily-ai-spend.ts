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
import { bigint, date, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

/**
 * Atomic daily AI-spend counter (Phase 1 hardening §7).
 *
 * Phase A: restructured for multi-user. The primary key is now (user_id, day)
 * so each user has their own daily spend counter. tryReserveBudget() issues
 * an UPDATE … WHERE total + est <= cap scoped to the user's row, so
 * concurrent reservations are serialised by Postgres at row level.
 *
 * One row per user per day keeps the table manageable (~365 rows/year/user).
 */
export const dailyAiSpend = pgTable(
  'daily_ai_spend',
  {
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** UTC calendar day (`YYYY-MM-DD`). */
    day: date('day').notNull(),
    /** Running estimated spend in USD cents — see helper docs. */
    totalUsdCents: bigint('total_usd_cents', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export type DailyAiSpendRow = typeof dailyAiSpend.$inferSelect;
export type DailyAiSpendInsert = typeof dailyAiSpend.$inferInsert;
