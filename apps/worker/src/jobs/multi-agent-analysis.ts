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

// U2 — Multi-agent analysis worker job.
//
// Polls the analysis_jobs table for status='pending' rows, claims the
// oldest job with a FOR UPDATE SKIP LOCKED query, runs the multi-agent
// pipeline, and updates the row with the result.
//
// This job runs on the worker VM inside the Docker container, using the
// same @hamafx/ai import as the Vercel route handler. No new network
// paths needed — communication is through the Postgres DB.

import { getDb, schema } from '@hamafx/db';
import { eq, asc, lt, and } from 'drizzle-orm';
import { pickAiEnv } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import type { JobContext, JobResult } from './types.js';
import type { AnalysisMode } from '@hamafx/ai';

/** How many pending jobs to process per polling interval. */
const MAX_JOBS_PER_RUN = 3;

/** Maximum time a job can stay in 'running' before being considered stale. */
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function runMultiAgentAnalysis(ctx: JobContext): Promise<JobResult> {
  const db = getDb();
  let processed = 0;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    // Claim the oldest pending job with FOR UPDATE SKIP LOCKED so
    // multiple worker instances don't race for the same job.
    const claimResult = await db.transaction(async (tx) => {
      const pending = await tx
        .select()
        .from(schema.analysisJobs)
        .where(eq(schema.analysisJobs.status, 'pending'))
        .orderBy(asc(schema.analysisJobs.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });

      if (pending.length === 0) return null;
      const job = pending[0]!;

      // Mark as running so no other worker picks it up.
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

    if (!claimResult) {
      ctx.log.info('No pending analysis jobs — done.');
      break;
    }

    const job = claimResult;
    ctx.log.info('Claimed analysis job', { jobId: job.id, userId: job.userId });

    try {
      // Dynamically import the multi-agent orchestrator — the worker
      // bundle includes @hamafx/ai (used by initLangfuse).
      const { runMultiAgentChat, extractUserMessageText, resolveMode } = await import('@hamafx/ai');
      const { userSettings: userSettingsTable } = schema;

      // Load user settings for context.
      const [userSettings] = await db
        .select()
        .from(userSettingsTable)
        .where(eq(userSettingsTable.userId, job.userId));

      if (!userSettings) {
        throw new Error(`User settings not found for userId=${job.userId}`);
      }

      // Reconstruct the user message and history from serialized parts.
      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: job.userMessageParts as UIMessage['parts'],
      } as UIMessage;

      const history: UIMessage[] = (Array.isArray(job.historyParts) ? job.historyParts : []) as UIMessage[];

      // Extract user text and resolve mode from the queued mode value.
      // The route handler already resolved this to a non-'single' mode
      // before queueing, so we use the stored mode to avoid re-detecting.
      const userText = extractUserMessageText(userMessage);
      const mode = resolveMode((job.mode as AnalysisMode) ?? 'full', userText);

      // Build progress handler that updates the job row.
      const progressEvents: Array<Record<string, unknown>> = [];
      const onProgress = (event: { type: string; [key: string]: unknown }) => {
        progressEvents.push(event as Record<string, unknown>);
        // Update the progress column asynchronously (fire-and-forget).
        void db
          .update(schema.analysisJobs)
          .set({ progress: progressEvents, updatedAt: new Date() })
          .where(eq(schema.analysisJobs.id, job.id))
          .catch((err) => ctx.log.warn('Failed to update progress', { err: String(err) }));
      };

      // Run the multi-agent pipeline. Uses the shared pickAiEnv helper
      // so the worker always passes the same env shape as the web route.
      const env = pickAiEnv(process.env as unknown as Parameters<typeof pickAiEnv>[0]);

      const result = await runMultiAgentChat({
        threadId: job.threadId,
        userId: job.userId,
        userMessage,
        history,
        userSettings,
        displayName: null,
        env,
        signal: ctx.signal ?? null,
        analysisMode: 'full',
        onProgress,
      });

      // Mark as complete.
      await db
        .update(schema.analysisJobs)
        .set({
          status: 'complete',
          result: {
            finalText: result.finalText,
            agentOpinions: result.agentOpinions,
            mode: result.mode,
            totalCostUsd: result.totalCostUsd,
            totalLatencyMs: result.totalLatencyMs,
            messageId: result.messageId,
          },
          progress: progressEvents,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.analysisJobs.id, job.id));

      ctx.log.info('Analysis job completed', { jobId: job.id, costUsd: result.totalCostUsd, latencyMs: result.totalLatencyMs });
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.error('Analysis job failed', { jobId: job.id, err: msg });

      await db
        .update(schema.analysisJobs)
        .set({
          status: 'failed',
          error: msg,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.analysisJobs.id, job.id));
      processed++;
    }
  }

  // Clean up stale jobs (running for >5 minutes — worker probably crashed).
  // Only mark jobs that have been running longer than STALE_JOB_TIMEOUT_MS.
  const staleCutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
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

  // Clean up old completed/failed jobs older than 7 days.
  const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    await db
      .delete(schema.analysisJobs)
      .where(lt(schema.analysisJobs.completedAt, retentionCutoff));
  } catch {
    // Best-effort cleanup — ignore failures.
  }

  ctx.log.info('Analysis job poll complete', { processed });

  return { processed, note: `processed=${processed}` };
}
