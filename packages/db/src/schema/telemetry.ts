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

import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/**
 * Discriminator for non-assistant-turn telemetry rows.
 *
 * Legacy assistant turns leave `kind` null; auxiliary paths emit one of:
 * - Title_Generator outcomes:
 *   - `title_generated`       — Title_Generator produced an LLM title.
 *   - `title_failed`          — Title_Generator LLM call errored; fallback persisted.
 *   - `title_skipped_budget`  — Daily_Budget_Guardrail blocked the call; fallback persisted.
 * - Routing breadcrumbs (Phase 7a) — one row per chat turn that records
 *   which domain the router picked. Used by `/settings/usage` to break
 *   spend down by domain. The associated `model` column carries the
 *   resolved model id.
 *   - `routing_fundamental`
 *   - `routing_technical`
 *   - `routing_summary`
 *   - `routing_vision`
 *   - `routing_generic`
 */
export type ChatTelemetryKind =
  | 'title_generated'
  | 'title_failed'
  | 'title_skipped_budget'
  | 'routing_fundamental'
  | 'routing_technical'
  | 'routing_summary'
  | 'routing_vision'
  | 'routing_generic'
  | 'plan_generated'
  | 'plan_skipped_budget'
  | 'plan_failed';

/**
 * Per-turn AI telemetry — drives /settings/usage and the daily $ ceiling.
 * One row per assistant turn (NOT per tool call) plus one row per Title_Generator
 * outcome (see `kind`).
 */
export const chatTelemetry = pgTable(
  'chat_telemetry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  (t) => [index('chat_telemetry_user_id_idx').on(t.userId), 
    index('telemetry_created_idx').on(t.createdAt),
    index('telemetry_thread_idx').on(t.threadId),
  ],
);

/** Inferred row shape returned by `select()` against `chat_telemetry`. */
export type ChatTelemetryRow = typeof chatTelemetry.$inferSelect;

/** Inferred input shape accepted by `insert()` against `chat_telemetry`. */
export type ChatTelemetryInsert = typeof chatTelemetry.$inferInsert;