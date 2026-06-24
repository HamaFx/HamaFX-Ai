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

import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/**
 * Per-tool execution telemetry — Phase 7b.
 *
 * The aggregate `chat_telemetry.toolCalls` count is fine for cost, but
 * /settings/usage benefits from a per-tool breakdown so the user can see
 * which tool dominates latency / failure rate. This table is append-only
 * and indexed on `(thread_id, created_at)` for the recent-turns drill-down.
 */
export const chatToolTelemetry = pgTable(
  'chat_tool_telemetry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    /** May be null for orphan tool calls (none today, kept for resilience). */
    threadId: uuid('thread_id'),
    /** May be null for tool calls that finished after the message saved. */
    messageId: uuid('message_id'),
    /** Tool name from `TOOL_NAMES`. */
    tool: text('tool').notNull(),
    /** End-to-end latency from invoke → settle, milliseconds. */
    ms: integer('ms').notNull().default(0),
    /** True on a successful tool result; false when the tool threw. */
    ok: boolean('ok').notNull().default(true),
    /** Optional short error code captured when `ok=false`. */
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('chat_tool_telemetry_user_id_idx').on(t.userId), 
    index('tool_telemetry_created_idx').on(t.createdAt),
    index('tool_telemetry_thread_idx').on(t.threadId, t.createdAt),
    index('tool_telemetry_tool_idx').on(t.tool),
  ],
);

export type ChatToolTelemetryRow = typeof chatToolTelemetry.$inferSelect;
export type ChatToolTelemetryInsert = typeof chatToolTelemetry.$inferInsert;