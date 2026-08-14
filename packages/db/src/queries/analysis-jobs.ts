/**
 * Copyright 2026 Kestrel
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

// Analysis jobs query helpers.

import { randomUUID } from 'node:crypto';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type AnalysisJobRow = typeof schema.analysisJobs.$inferSelect;
export type AnalysisJobInsert = typeof schema.analysisJobs.$inferInsert;

/**
 * Insert a queued analysis job exactly once for a user and idempotency key.
 * Concurrent retries converge on the row created by the winning insert.
 */
export async function enqueueAnalysisJob(
  input: Omit<AnalysisJobInsert, 'idempotencyKey'> & { idempotencyKey: string },
): Promise<AnalysisJobRow | null> {
  const db = getDb();
  const inserted = await db
    .insert(schema.analysisJobs)
    .values(input)
    .onConflictDoNothing({
      target: [schema.analysisJobs.userId, schema.analysisJobs.idempotencyKey],
    })
    .returning();

  if (inserted[0]) return inserted[0];

  const [existing] = await db
    .select()
    .from(schema.analysisJobs)
    .where(
      and(
        eq(schema.analysisJobs.userId, input.userId),
        eq(schema.analysisJobs.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return existing ?? null;
}

/**
 * Claim the oldest pending analysis job with FOR UPDATE SKIP LOCKED.
 * Returns the claimed job or null if none available.
 */
export async function claimNextPendingJob(): Promise<AnalysisJobRow | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(schema.analysisJobs)
      .where(eq(schema.analysisJobs.status, 'pending'))
      .orderBy(asc(schema.analysisJobs.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });

    if (pending.length === 0) return null;
    const job = pending[0]!;

    const now = new Date();
    const workerRunId = `${process.env.HOSTNAME ?? 'worker'}-${randomUUID()}`;
    const [claimed] = await tx
      .update(schema.analysisJobs)
      .set({
        status: 'running',
        startedAt: now,
        updatedAt: now,
        workerRunId,
        attemptCount: sql`${schema.analysisJobs.attemptCount} + 1`,
      })
      .where(and(eq(schema.analysisJobs.id, job.id), eq(schema.analysisJobs.status, 'pending')))
      .returning();

    if (!claimed) return null;
    return claimed;
  });
}

/**
 * Recover stale running jobs using the same bounded-attempt policy as the
 * worker. Expired jobs are requeued while attempts remain and become
 * terminally failed after the maximum attempt count.
 */
export async function recoverStaleJobs(
  staleCutoff: Date,
  maxAttempts: number,
): Promise<{ requeued: number; failed: number }> {
  const db = getDb();
  const now = new Date();
  const [requeued, failed] = await Promise.all([
    db
      .update(schema.analysisJobs)
      .set({
        status: 'pending',
        error: 'Worker lease expired; retrying automatically.',
        startedAt: null,
        workerRunId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.analysisJobs.status, 'running'),
          lt(schema.analysisJobs.updatedAt, staleCutoff),
          sql`${schema.analysisJobs.attemptCount} < ${maxAttempts}`,
        ),
      )
      .returning({ id: schema.analysisJobs.id }),
    db
      .update(schema.analysisJobs)
      .set({
        status: 'failed',
        error: 'Job timed out — maximum worker attempts reached.',
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.analysisJobs.status, 'running'),
          lt(schema.analysisJobs.updatedAt, staleCutoff),
          sql`${schema.analysisJobs.attemptCount} >= ${maxAttempts}`,
        ),
      )
      .returning({ id: schema.analysisJobs.id }),
  ]);

  return { requeued: requeued.length, failed: failed.length };
}

/**
 * Legacy helper retained for callers that want all stale jobs terminally
 * failed. New worker paths should use `recoverStaleJobs`.
 */
export async function failStaleJobs(staleCutoff: Date): Promise<void> {
  const db = getDb();
  await db
    .update(schema.analysisJobs)
    .set({
      status: 'failed',
      error: 'Job timed out — worker may have restarted.',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.analysisJobs.status, 'running'),
        lt(schema.analysisJobs.updatedAt, staleCutoff),
      ),
    );
}

/**
 * Get a single analysis job by ID. Returns null if not found.
 */
export async function getAnalysisJob(userId: string, jobId: string): Promise<AnalysisJobRow | null> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(schema.analysisJobs)
    .where(
      and(
        eq(schema.analysisJobs.id, jobId),
        eq(schema.analysisJobs.userId, userId),
      ),
    )
    .limit(1);
  return job ?? null;
}

/**
 * Delete old completed/failed jobs older than `retentionCutoff`.
 */
export async function purgeOldJobs(retentionCutoff: Date): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.analysisJobs)
    .where(lt(schema.analysisJobs.completedAt, retentionCutoff));
}
