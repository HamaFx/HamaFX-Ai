/**
 * Copyright 2026 Kestrel
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
import { date, doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export type AiBudgetReservationStatus = 'reserved' | 'reconciled' | 'released';

/**
 * Durable audit ledger for daily AI budget reservations.
 *
 * The daily counter remains the fast admission-control value. This table is
 * the recovery source of truth when a process exits between reservation and
 * terminal reconciliation.
 */
export const aiBudgetReservations = pgTable(
  'ai_budget_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id'),
    day: date('day').notNull(),
    reservedUsdCents: doublePrecision('reserved_usd_cents').notNull(),
    actualUsdCents: doublePrecision('actual_usd_cents'),
    status: text('status').$type<AiBudgetReservationStatus>().notNull().default('reserved'),
    traceId: text('trace_id'),
    runId: text('run_id'),
    jobId: text('job_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (table) => [
    index('ai_budget_reservations_user_day_idx').on(table.userId, table.day),
    index('ai_budget_reservations_status_idx').on(table.status, table.createdAt),
    index('ai_budget_reservations_trace_idx').on(table.traceId, table.createdAt),
  ],
);

export type AiBudgetReservationRow = typeof aiBudgetReservations.$inferSelect;
export type AiBudgetReservationInsert = typeof aiBudgetReservations.$inferInsert;
