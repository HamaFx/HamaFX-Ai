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
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export type PersistenceOutboxOperation =
  | 'message.user'
  | 'message.assistant'
  | 'agent.opinions'
  | 'telemetry.turn'
  | 'telemetry.tool'
  | 'diagnostic.trace';

export type PersistenceOutboxStatus = 'pending' | 'processing' | 'failed' | 'completed' | 'dead';

/**
 * Durable retry queue for writes whose original request could not reach the
 * database. Payloads are already redacted/stripped by the producing writer.
 * Dedupe keys are replay-safe because every supported operation has an
 * idempotent database write contract.
 */
export const persistenceOutbox = pgTable(
  'persistence_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    operation: text('operation').$type<PersistenceOutboxOperation>().notNull(),
    status: text('status').$type<PersistenceOutboxStatus>().notNull().default('pending'),
    dedupeKey: text('dedupe_key').notNull(),
    threadId: text('thread_id'),
    messageId: text('message_id'),
    traceId: text('trace_id'),
    runId: text('run_id'),
    jobId: text('job_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(8),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lockToken: text('lock_token'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('persistence_outbox_dedupe_uk').on(table.tenantId, table.dedupeKey),
    index('persistence_outbox_pending_idx').on(table.status, table.nextAttemptAt),
    index('persistence_outbox_tenant_idx').on(table.tenantId, table.createdAt),
    index('persistence_outbox_trace_idx').on(table.traceId, table.createdAt),
  ],
);

export type PersistenceOutboxRow = typeof persistenceOutbox.$inferSelect;
export type PersistenceOutboxInsert = typeof persistenceOutbox.$inferInsert;
