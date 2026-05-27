import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  (t) => [
    index('tool_telemetry_created_idx').on(t.createdAt),
    index('tool_telemetry_thread_idx').on(t.threadId, t.createdAt),
    index('tool_telemetry_tool_idx').on(t.tool),
  ],
);

export type ChatToolTelemetryRow = typeof chatToolTelemetry.$inferSelect;
export type ChatToolTelemetryInsert = typeof chatToolTelemetry.$inferInsert;
