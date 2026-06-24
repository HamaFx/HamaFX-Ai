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

import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/**
 * Chat threads. One row per conversation. Personal-mode: no `user_id`.
 */
export const chatThreads = pgTable(
  'chat_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    title: text('title'),
    /** "XAUUSD" | "EURUSD" | "GBPUSD" — kept as text to avoid a coupling enum. */
    pinnedSymbol: text('pinned_symbol'),
    /** Provider/model id override, e.g. "anthropic/claude-3.7-sonnet". */
    modelOverride: text('model_override'),
    /** How `title` was produced: `'llm' | 'fallback' | null` (legacy rows). */
    titleSource: text('title_source'),
    /**
     * True for the single thread reserved for cron-emitted briefings
     * (pre-event / post-event / weekly review). The thread list pins it
     * to the top. See packages/ai/src/briefings/persistence.ts.
     */
    isBriefings: boolean('is_briefings').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('chat_threads_updated_at_idx').on(t.updatedAt),
    index('chat_threads_user_id_idx').on(t.userId),
  ],
);

/**
 * Chat messages. `parts` carries provider-agnostic JSON for tool calls /
 * tool results / attachments — see Vercel AI SDK v5 message-parts model.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .references(() => chatThreads.id, { onDelete: 'cascade' })
      .notNull(),
    /** "user" | "assistant" | "system" | "tool" — kept as text. */
    role: text('role').notNull(),
    content: text('content').notNull().default(''),
    parts: jsonb('parts'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('chat_messages_thread_idx').on(t.threadId, t.createdAt)],
);
