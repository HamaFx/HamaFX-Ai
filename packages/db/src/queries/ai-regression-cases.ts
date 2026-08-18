// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { getDb, schema } from '../client';
import type { RegressionCaseStatus } from '../schema/ai-regression-cases';

export type AiRegressionCaseRow = typeof schema.aiRegressionCases.$inferSelect;

export interface ListAiRegressionCasesOptions {
  limit?: number;
  offset?: number;
  status?: RegressionCaseStatus;
}

/**
 * Synchronize a regression case with a reviewed feedback row.
 *
 * A case is opened only for an explicit reviewer `fail` label. If the same
 * feedback is later reclassified, the existing case is dismissed rather than
 * deleted, preserving the audit trail.
 */
export async function syncAiRegressionCase(feedbackId: string): Promise<AiRegressionCaseRow | null> {
  const db = getDb();
  const feedbackRows = await db
    .select({
      feedback: schema.aiMessageFeedback,
      assistantText: schema.chatMessages.content,
      assistantCreatedAt: schema.chatMessages.createdAt,
    })
    .from(schema.aiMessageFeedback)
    .innerJoin(schema.chatMessages, eq(schema.chatMessages.id, schema.aiMessageFeedback.messageId))
    .where(eq(schema.aiMessageFeedback.id, feedbackId))
    .limit(1);
  const source = feedbackRows[0];
  if (!source) return null;

  const prompt = await findNearestPrompt(
    source.feedback.threadId,
    source.assistantCreatedAt,
  );
  const isFailure = source.feedback.reviewStatus === 'reviewed' && source.feedback.reviewerLabel === 'fail';

  if (!isFailure) {
    await db
      .update(schema.aiRegressionCases)
      .set({ status: 'dismissed', updatedAt: new Date() })
      .where(eq(schema.aiRegressionCases.feedbackId, feedbackId));
    return null;
  }

  const [row] = await db
    .insert(schema.aiRegressionCases)
    .values({
      feedbackId,
      userId: source.feedback.userId,
      tenantId: source.feedback.tenantId,
      threadId: source.feedback.threadId,
      messageId: source.feedback.messageId,
      promptSha256: sha256(prompt),
      assistantOutputSha256: sha256(source.assistantText),
      issueCodes: source.feedback.issueCodes ?? [],
      reviewerNote: source.feedback.reviewerNote,
      status: 'open',
    })
    .onConflictDoUpdate({
      target: schema.aiRegressionCases.feedbackId,
      set: {
        promptSha256: sha256(prompt),
        assistantOutputSha256: sha256(source.assistantText),
        issueCodes: source.feedback.issueCodes ?? [],
        reviewerNote: source.feedback.reviewerNote,
        status: 'open',
        updatedAt: new Date(),
      },
    })
    .returning();

  return row ?? null;
}

export async function listAiRegressionCases(
  options: ListAiRegressionCasesOptions = {},
): Promise<AiRegressionCaseRow[]> {
  const conditions = [];
  if (options.status) conditions.push(eq(schema.aiRegressionCases.status, options.status));

  return getDb()
    .select()
    .from(schema.aiRegressionCases)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.aiRegressionCases.updatedAt))
    .limit(Math.min(500, Math.max(1, options.limit ?? 100)))
    .offset(Math.max(0, options.offset ?? 0));
}

export async function updateAiRegressionCaseStatus(
  id: string,
  status: RegressionCaseStatus,
): Promise<AiRegressionCaseRow | null> {
  const [row] = await getDb()
    .update(schema.aiRegressionCases)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.aiRegressionCases.id, id))
    .returning();
  return row ?? null;
}

async function findNearestPrompt(threadId: string, assistantCreatedAt: Date): Promise<string> {
  const rows = await getDb()
    .select({ content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(and(
      eq(schema.chatMessages.threadId, threadId),
      eq(schema.chatMessages.role, 'user'),
      sql`${schema.chatMessages.createdAt} < ${assistantCreatedAt}`,
    ))
    .orderBy(desc(schema.chatMessages.createdAt), asc(schema.chatMessages.id))
    .limit(1);
  return rows[0]?.content ?? '';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
