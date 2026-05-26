import { doublePrecision, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Discriminator for non-assistant-turn telemetry rows.
 *
 * Legacy assistant turns leave `kind` null; the auto-title path emits one of:
 * - `title_generated`       — Title_Generator produced an LLM title.
 * - `title_failed`          — Title_Generator LLM call errored; fallback persisted.
 * - `title_skipped_budget`  — Daily_Budget_Guardrail blocked the call; fallback persisted.
 */
export type ChatTelemetryKind = 'title_generated' | 'title_failed' | 'title_skipped_budget';

/**
 * Per-turn AI telemetry — drives /settings/usage and the daily $ ceiling.
 * One row per assistant turn (NOT per tool call) plus one row per Title_Generator
 * outcome (see `kind`).
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
    /**
     * Row marker. `null` for legacy assistant turns; one of `ChatTelemetryKind`
     * for Title_Generator events. Stored as plain text so we can extend the
     * vocabulary later without a migration.
     */
    kind: text('kind').$type<ChatTelemetryKind | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('telemetry_created_idx').on(t.createdAt),
    index('telemetry_thread_idx').on(t.threadId),
  ],
);

/** Inferred row shape returned by `select()` against `chat_telemetry`. */
export type ChatTelemetryRow = typeof chatTelemetry.$inferSelect;

/** Inferred input shape accepted by `insert()` against `chat_telemetry`. */
export type ChatTelemetryInsert = typeof chatTelemetry.$inferInsert;
