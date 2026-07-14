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

// U2 — analysis_jobs table for background multi-agent full-mode analysis.
//
// When a user requests 'full' analysis mode, the Vercel route inserts a
// row here with status='pending'. The worker polls this table and runs
// the analysis when it finds pending work. The client polls the API
// endpoint until status='complete' or 'failed'.

import { pgTable, text, timestamp, jsonb, varchar, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { chatThreads } from './chat';

export const analysisJobs = pgTable('analysis_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  threadId: uuid('thread_id')
    .notNull()
    .references(() => chatThreads.id, { onDelete: 'cascade' }),

  /** The user's message text that triggered the analysis. */
  userMessageText: text('user_message_text').notNull(),

  /** Serialized UIMessage parts (for full context replay by the worker). */
  userMessageParts: jsonb('user_message_parts').notNull().$type<unknown>(),

  /** Serialized message history at the time of the request. */
  historyParts: jsonb('history_parts').notNull().$type<unknown>(),

  /** The resolved analysis mode (always 'full' for now, but extensible). */
  mode: varchar('mode', { length: 20 }).notNull().default('full'),

  /** Status: pending → running → complete | failed. */
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  /** Serialized progress events (agent_start, agent_done, etc.). */
  progress: jsonb('progress').$type<Array<Record<string, unknown>>>(),

  /**
   * The final result when status='complete'.
   * Shape: { finalText: string, agentOpinions: ..., totalCostUsd: number, ... }
   */
  result: jsonb('result').$type<Record<string, unknown>>(),

  /** Error message when status='failed'. */
  error: text('error'),

  /** Worker-assigned correlation id for log tracing. */
  workerRunId: text('worker_run_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  /** The job is considered stale after 5 minutes if still pending. */
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  // Index for worker polling: find pending jobs quickly.
  {
    name: 'idx_analysis_jobs_status',
    columns: [table.status, table.createdAt],
  },
  // Index for client polling: look up a specific job by id.
  {
    name: 'idx_analysis_jobs_user',
    columns: [table.userId],
  },
]);
