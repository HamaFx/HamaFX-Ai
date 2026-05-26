// Idempotency lookup for the briefings cron. Prevents two pre-event or two
// post-event briefings firing for the same event, and pins the most recent
// weekly_review.
//
// Composite primary key (event_id, kind):
//   - event_id is the `economic_events.id` for pre/post; the literal string
//     'weekly_review' for the weekly cron (no event scope).
//   - kind ∈ {'pre', 'post', 'weekly_review'}.
//
// `message_id` references the assistant `chat_messages` row that carries the
// briefing body, with ON DELETE CASCADE so a wiped chat history can't leave
// dangling pointers.

import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { chatMessages } from './chat';

export const briefingsEmitted = pgTable(
  'briefings_emitted',
  {
    eventId: text('event_id').notNull(),
    kind: text('kind').notNull(), // 'pre' | 'post' | 'weekly_review'
    messageId: uuid('message_id')
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.kind] })],
);
