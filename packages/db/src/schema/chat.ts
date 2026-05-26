import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Chat threads. One row per conversation. Personal-mode: no `user_id`.
 */
export const chatThreads = pgTable(
  'chat_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
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
      .$onUpdate(() => sql`now()`),
  },
  (t) => [index('chat_threads_updated_at_idx').on(t.updatedAt)],
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
