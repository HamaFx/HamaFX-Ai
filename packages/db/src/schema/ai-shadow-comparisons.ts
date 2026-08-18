// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { organization, users } from './auth';
import { chatThreads } from './chat';

export type ShadowComparisonOutcome = 'completed' | 'failed';
export type ShadowComparisonAgent = 'mastra' | 'legacy';
export type ShadowOverlap = 'none' | 'low' | 'medium' | 'high';

/**
 * Privacy-safe paired comparison data for the internal AI rollout dashboard.
 * Raw prompts and model output are deliberately not stored here.
 */
export const aiShadowComparisons = pgTable(
  'ai_shadow_comparisons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'cascade' }),
    promptSha256: text('prompt_sha256').notNull(),
    primaryAgent: text('primary_agent').$type<ShadowComparisonAgent>().notNull(),
    outcome: text('outcome').$type<ShadowComparisonOutcome>().notNull(),
    failureReason: text('failure_reason'),
    legacyChars: integer('legacy_chars'),
    mastraChars: integer('mastra_chars'),
    sharedTokenRatio: doublePrecision('shared_token_ratio'),
    overlap: text('overlap').$type<ShadowOverlap>(),
    mastraVerified: boolean('mastra_verified'),
    mastraBias: text('mastra_bias'),
    mastraDataQuality: text('mastra_data_quality'),
    primaryLatencyMs: integer('primary_latency_ms'),
    shadowLatencyMs: integer('shadow_latency_ms'),
    primaryCostUsd: doublePrecision('primary_cost_usd'),
    shadowCostUsd: doublePrecision('shadow_cost_usd'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_shadow_comparisons_created_idx').on(table.createdAt),
    index('ai_shadow_comparisons_thread_idx').on(table.threadId, table.createdAt),
    index('ai_shadow_comparisons_outcome_idx').on(table.outcome, table.createdAt),
    index('ai_shadow_comparisons_primary_idx').on(table.primaryAgent, table.createdAt),
  ],
);

export type AiShadowComparisonRow = typeof aiShadowComparisons.$inferSelect;
export type AiShadowComparisonInsert = typeof aiShadowComparisons.$inferInsert;
