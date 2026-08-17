/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';
import { chatMessages, chatThreads } from './chat';

export type FeedbackRating = 'positive' | 'negative';
export type FeedbackReviewStatus = 'unreviewed' | 'in_review' | 'reviewed' | 'rejected';
export type FeedbackLabel = 'pass' | 'fail' | 'needs_review';

/**
 * Durable user feedback and reviewer annotation for an assistant message.
 *
 * One user can revise their feedback for a message, while admins retain the
 * review fields used to promote production failures into governed datasets.
 * Raw conversation content is intentionally not copied into this table.
 */
export const aiMessageFeedback = pgTable(
  'ai_message_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull().references(() => chatThreads.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
    /** Distributed trace correlation for incident review. */
    traceId: text('trace_id'),
    rating: text('rating').$type<FeedbackRating>().notNull(),
    userNote: text('user_note'),
    reviewStatus: text('review_status').$type<FeedbackReviewStatus>().notNull().default('unreviewed'),
    reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    reviewerLabel: text('reviewer_label').$type<FeedbackLabel>(),
    issueCodes: jsonb('issue_codes').$type<string[]>(),
    reviewerNote: text('reviewer_note'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_message_feedback_user_message_uk').on(table.userId, table.messageId),
    index('ai_message_feedback_review_status_idx').on(table.reviewStatus, table.updatedAt),
    index('ai_message_feedback_thread_idx').on(table.threadId, table.createdAt),
    index('ai_message_feedback_trace_idx').on(table.traceId, table.createdAt),
    index('ai_message_feedback_reviewer_idx').on(table.reviewerId, table.reviewedAt),
  ],
);

export type AiMessageFeedbackRow = typeof aiMessageFeedback.$inferSelect;
export type AiMessageFeedbackInsert = typeof aiMessageFeedback.$inferInsert;
