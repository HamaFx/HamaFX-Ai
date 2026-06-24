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

// Idempotency lookup for the briefings cron. Prevents two pre-event or two
// post-event briefings firing for the same event, and pins the most recent
// weekly_review.
//
// Phase A: added user_id so briefings are scoped per user.
//
// Composite primary key (user_id, event_id, kind):
//   - event_id is the `economic_events.id` for pre/post; the literal string
//     'weekly_review' for the weekly cron (no event scope).
//   - kind ∈ {'pre', 'post', 'weekly_review'}.
//
// `message_id` references the assistant `chat_messages` row that carries the
// briefing body, with ON DELETE CASCADE so a wiped chat history can't leave
// dangling pointers.

import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { chatMessages } from './chat.js';

export const briefingsEmitted = pgTable(
  'briefings_emitted',
  {
    /** Phase A — multi-user. Which user this briefing was generated for. */
    userId: text('user_id').notNull()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    kind: text('kind').notNull(), // 'pre' | 'post' | 'weekly_review'
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId, t.kind] })],
);