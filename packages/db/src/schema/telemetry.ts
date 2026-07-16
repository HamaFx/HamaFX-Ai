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

import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

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
  | 'plan_failed'
  // P3: per-specialist multi-agent telemetry breadcrumbs.
  | 'multi_specialist_technical'
  | 'multi_specialist_fundamental'
  | 'multi_specialist_risk'
  | 'multi_specialist_sentiment'
  | 'multi_specialist_decision';

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
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    threadId: uuid('thread_id'),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
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
    index('chat_telemetry_tenant_id_idx').on(t.tenantId),
    // Phase 3 §17 — chat_telemetry_user_id_idx dropped; the composite
    // telemetry_user_created_idx (user_id, created_at) covers leftmost-prefix
    // queries on user_id alone.
    index('telemetry_created_idx').on(t.createdAt),
    index('telemetry_thread_idx').on(t.threadId),
    // PERF-03: Composite index for the 30-day usage range query in computeUsage().
    // The query filters WHERE userId = ? AND createdAt >= ? AND createdAt <= ?
    // — leading with userId then createdAt lets Postgres range-scan this index
    // without a bitmap merge of two single-column indexes.
    index('telemetry_user_created_idx').on(t.userId, t.createdAt),
  ],
);

/** Inferred row shape returned by `select()` against `chat_telemetry`. */
export type ChatTelemetryRow = typeof chatTelemetry.$inferSelect;

/** Inferred input shape accepted by `insert()` against `chat_telemetry`. */
export type ChatTelemetryInsert = typeof chatTelemetry.$inferInsert;
