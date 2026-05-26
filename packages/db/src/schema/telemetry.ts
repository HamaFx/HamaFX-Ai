import { doublePrecision, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Per-turn AI telemetry — drives /settings/usage and the daily $ ceiling.
 * One row per assistant turn (NOT per tool call).
 */
export const chatTelemetry = pgTable(
  'chat_telemetry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id'),
    messageId: uuid('message_id'),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    toolCalls: integer('tool_calls').notNull().default(0),
    /** End-to-end latency in milliseconds for this turn. */
    ms: integer('ms').notNull().default(0),
    /** Estimated cost in USD; computed from per-model rate at insert time. */
    estCostUsd: doublePrecision('est_cost_usd').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('telemetry_created_idx').on(t.createdAt),
    index('telemetry_thread_idx').on(t.threadId),
  ],
);
