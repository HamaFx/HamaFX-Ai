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

// Analysis jobs query helpers.

import { and, asc, eq, lt } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type AnalysisJobRow = typeof schema.analysisJobs.$inferSelect;
export type AnalysisJobInsert = typeof schema.analysisJobs.$inferInsert;

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

    await tx
      .update(schema.analysisJobs)
      .set({
        status: 'running',
        startedAt: new Date(),
        workerRunId: `${process.env.HOSTNAME ?? 'worker'}-${Date.now()}`,
      })
      .where(eq(schema.analysisJobs.id, job.id));

    return job;
  });
}

/**
 * Mark stale running jobs as failed.
 * Jobs running longer than `staleCutoff` are considered crashed.
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
        lt(schema.analysisJobs.startedAt, staleCutoff),
      ),
    );
}

/**
 * Get a single analysis job by ID. Returns null if not found.
 */
export async function getAnalysisJob(jobId: string): Promise<AnalysisJobRow | null> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(schema.analysisJobs)
    .where(eq(schema.analysisJobs.id, jobId))
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
