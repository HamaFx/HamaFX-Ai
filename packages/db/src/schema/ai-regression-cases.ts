// SPDX-License-Identifier: Apache-2.0

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';
import { chatMessages, chatThreads } from './chat';
import { aiMessageFeedback } from './ai-feedback';

export type RegressionCaseStatus = 'open' | 'resolved' | 'dismissed';

/**
 * A privacy-safe regression case created from a reviewed AI failure.
 * Conversation text is deliberately referenced by IDs and represented by
 * hashes; the source message remains under the user's normal retention rules.
 */
export const aiRegressionCases = pgTable(
  'ai_regression_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedbackId: uuid('feedback_id').notNull().references(() => aiMessageFeedback.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
    promptSha256: text('prompt_sha256').notNull(),
    assistantOutputSha256: text('assistant_output_sha256').notNull(),
    issueCodes: jsonb('issue_codes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    reviewerNote: text('reviewer_note'),
    status: text('status').$type<RegressionCaseStatus>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_regression_cases_feedback_uk').on(table.feedbackId),
    index('ai_regression_cases_status_idx').on(table.status, table.updatedAt),
    index('ai_regression_cases_user_idx').on(table.userId, table.createdAt),
  ],
);

export type AiRegressionCaseRow = typeof aiRegressionCases.$inferSelect;
export type AiRegressionCaseInsert = typeof aiRegressionCases.$inferInsert;
