/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

/** Reviewer-approved feedback joined to the persisted prompt + answer text. */
export interface ReviewedTrainingPair {
  messageId: string;
  threadId: string;
  userId: string;
  prompt: string;
  assistantText: string;
  rating: 'positive' | 'negative';
  reviewerLabel: 'pass' | 'fail' | 'needs_review' | null;
  issueCodes: string[] | null;
  reviewerNote: string | null;
  userNote: string | null;
  reviewedAt: Date | null;
}

export interface ListReviewedTrainingPairsOptions {
  limit?: number;
  offset?: number;
}

/**
 * Pull reviewer-approved feedback rows for the dataset assembly job.
 *
 * Only rows a reviewer explicitly labelled (`reviewed` + non-null
 * `reviewerLabel`) are returned. Each row is joined to:
 *  - the assistant message it belongs to (`chat_messages.content`), and
 *  - the nearest preceding user message in the same thread (the prompt).
 *
 * The prompt lookup uses a correlated subquery so the whole batch comes back
 * in one round-trip; threads keep the standard (thread_id, created_at) index.
 */
export async function listReviewedTrainingPairs(
  options: ListReviewedTrainingPairsOptions = {},
): Promise<ReviewedTrainingPair[]> {
  const db = getDb();
  const { limit = 500, offset = 0 } = options;
  const feedback = schema.aiMessageFeedback;
  const assistant = schema.chatMessages;

  // The inner table is aliased (`p`) so `chat_messages` in the WHERE clause
  // resolves to the OUTER row; an unaliased subquery would shadow itself and
  // the correlation would be self-referential (always empty).
  const promptSql = sql<string>`(
    SELECT p.content FROM chat_messages p
    WHERE p.thread_id = ${assistant.threadId}
      AND p.role = 'user'
      AND p.created_at < ${assistant.createdAt}
    ORDER BY p.created_at DESC
    LIMIT 1
  )`;

  return db
    .select({
      messageId: feedback.messageId,
      threadId: feedback.threadId,
      userId: feedback.userId,
      rating: feedback.rating,
      reviewerLabel: feedback.reviewerLabel,
      issueCodes: feedback.issueCodes,
      reviewerNote: feedback.reviewerNote,
      userNote: feedback.userNote,
      reviewedAt: feedback.reviewedAt,
      assistantText: assistant.content,
      prompt: promptSql,
    })
    .from(feedback)
    .innerJoin(assistant, eq(assistant.id, feedback.messageId))
    .where(and(
      eq(feedback.reviewStatus, 'reviewed'),
      isNotNull(feedback.reviewerLabel),
    ))
    .orderBy(desc(feedback.reviewedAt))
    .limit(Math.min(5000, Math.max(1, limit)))
    .offset(Math.max(0, offset));
}
