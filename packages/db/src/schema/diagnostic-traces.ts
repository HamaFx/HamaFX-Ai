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

import { pgTable, text, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const diagnosticTraces = pgTable(
  'diagnostic_traces',
  {
    id: text('id').primaryKey(), // traceId (UUID)
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMs: integer('duration_ms'),
    stepCount: integer('step_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    status: text('status', { enum: ['completed', 'failed'] }).notNull(),
    trace: jsonb('trace').notNull(), // full exportDiagnosticContext() output
  },
  (t) => [
    index('diag_traces_user_id_idx').on(t.userId),
    index('diag_traces_thread_id_idx').on(t.threadId),
    index('diag_traces_started_at_idx').on(t.startedAt),
  ],
);

export type DiagnosticTraceRow = typeof diagnosticTraces.$inferSelect;
export type DiagnosticTraceInsert = typeof diagnosticTraces.$inferInsert;
