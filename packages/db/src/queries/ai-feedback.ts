/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';
import type { FeedbackReviewStatus } from '../schema/ai-feedback';

export type AiMessageFeedbackRow = typeof schema.aiMessageFeedback.$inferSelect;

export interface SaveMessageFeedbackInput {
  userId: string;
  threadId: string;
  messageId: string;
  traceId?: string;
  rating: 'positive' | 'negative';
  userNote?: string;
}

/** Save or revise feedback only when the message belongs to the caller's thread. */
export async function upsertMessageFeedback(
  input: SaveMessageFeedbackInput,
): Promise<AiMessageFeedbackRow | null> {
  const db = getDb();
  const ownedMessage = await db
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .innerJoin(schema.chatThreads, eq(schema.chatMessages.threadId, schema.chatThreads.id))
    .where(and(
      eq(schema.chatMessages.id, input.messageId),
      eq(schema.chatMessages.threadId, input.threadId),
      eq(schema.chatMessages.role, 'assistant'),
      eq(schema.chatThreads.userId, input.userId),
    ))
    .limit(1);

  if (!ownedMessage[0]) return null;

  const [row] = await db
    .insert(schema.aiMessageFeedback)
    .values({
      userId: input.userId,
      threadId: input.threadId,
      messageId: input.messageId,
      ...(input.traceId ? { traceId: input.traceId } : {}),
      rating: input.rating,
      ...(input.userNote ? { userNote: input.userNote } : {}),
    })
    .onConflictDoUpdate({
      target: [schema.aiMessageFeedback.userId, schema.aiMessageFeedback.messageId],
      set: {
        rating: input.rating,
        userNote: input.userNote ?? null,
        ...(input.traceId ? { traceId: input.traceId } : {}),
        reviewStatus: 'unreviewed',
        reviewerId: null,
        reviewerLabel: null,
        issueCodes: null,
        reviewerNote: null,
        reviewedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row ?? null;
}

export async function getMessageFeedback(
  userId: string,
  threadId: string,
  messageId: string,
): Promise<AiMessageFeedbackRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.aiMessageFeedback)
    .where(and(
      eq(schema.aiMessageFeedback.userId, userId),
      eq(schema.aiMessageFeedback.threadId, threadId),
      eq(schema.aiMessageFeedback.messageId, messageId),
    ))
    .limit(1);
  return row ?? null;
}

export async function deleteMessageFeedback(
  userId: string,
  threadId: string,
  messageId: string,
): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.aiMessageFeedback)
    .where(and(
      eq(schema.aiMessageFeedback.userId, userId),
      eq(schema.aiMessageFeedback.threadId, threadId),
      eq(schema.aiMessageFeedback.messageId, messageId),
    ))
    .returning({ id: schema.aiMessageFeedback.id });
  return deleted.length > 0;
}

export interface ListFeedbackOptions {
  limit: number;
  offset: number;
  reviewStatus?: FeedbackReviewStatus;
}

export async function listFeedbackForReview(
  options: ListFeedbackOptions,
): Promise<AiMessageFeedbackRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.aiMessageFeedback)
    .where(options.reviewStatus
      ? eq(schema.aiMessageFeedback.reviewStatus, options.reviewStatus)
      : undefined)
    .orderBy(desc(schema.aiMessageFeedback.updatedAt))
    .limit(options.limit)
    .offset(options.offset);
}

export interface ReviewMessageFeedbackInput {
  id: string;
  reviewerId: string;
  status: 'unreviewed' | 'in_review' | 'reviewed' | 'rejected';
  label?: 'pass' | 'fail' | 'needs_review';
  issueCodes?: string[];
  reviewerNote?: string;
}

export async function reviewMessageFeedback(
  input: ReviewMessageFeedbackInput,
): Promise<AiMessageFeedbackRow | null> {
  const db = getDb();
  const [row] = await db
    .update(schema.aiMessageFeedback)
    .set({
      reviewStatus: input.status,
      reviewerId: input.reviewerId,
      reviewerLabel: input.label ?? null,
      issueCodes: input.issueCodes ?? null,
      reviewerNote: input.reviewerNote ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.aiMessageFeedback.id, input.id))
    .returning();
  return row ?? null;
}
