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

// U2 — Multi-agent analysis worker job.
//
// Polls the analysis_jobs table for status='pending' rows, claims the
// oldest job with a FOR UPDATE SKIP LOCKED query, runs the multi-agent
// pipeline, and updates the row with the result.
//
// This job runs on the worker VM inside the Docker container, using the
// same @kestrel/ai import as the Vercel route handler. No new network
// paths needed — communication is through the Postgres DB.

import { schema } from '@kestrel/db';
import { getDb, ProgressTracker, selectAgents } from '@kestrel/ai';
import type { ProgressEvent } from '@kestrel/ai';
import { eq, asc, lt, and, sql } from 'drizzle-orm';
import { pickAiEnv } from '@kestrel/shared';
import { traceIdStorage } from '@kestrel/shared/logger';
import type { UIMessage } from 'ai';
import type { JobContext, JobResult } from './types.js';
import type { AnalysisMode } from '@kestrel/ai';

/** How many pending jobs to process per polling interval. */
const MAX_JOBS_PER_RUN = 3;

/** Maximum time a job can stay in 'running' before being considered stale. */
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ANALYSIS_ATTEMPTS = 3;

export function isRetryableAnalysisError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:timeout|timed?\s*out|aborted|network|fetch\s*failed|rate\s*limit|too\s*many\s*requests|temporar(?:y|ily)|connection|ECONNRESET|5\d\d)/i.test(message);
}

function reconstructHistory(raw: unknown): UIMessage[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as {
      id?: unknown;
      role?: unknown;
      content?: unknown;
      parts?: unknown;
    };
    if (row.role !== 'user' && row.role !== 'assistant' && row.role !== 'system') return [];

    const parts = Array.isArray(row.parts) && row.parts.length > 0
      ? row.parts
      : [{ type: 'text', text: typeof row.content === 'string' ? row.content : '' }];

    return [{
      id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
      role: row.role,
      parts: parts as UIMessage['parts'],
    } as UIMessage];
  });
}

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
      const workerRunId = `${process.env.HOSTNAME ?? 'worker'}-${crypto.randomUUID()}`;
      const now = new Date();

      // Mark as running and issue a unique lease token. All later writes
      // must include this token so a stale worker can never overwrite a
      // newer worker's terminal state.
      await tx
        .update(schema.analysisJobs)
        .set({
          status: 'running',
          startedAt: now,
          updatedAt: now,
          workerRunId,
          attemptCount: sql`${schema.analysisJobs.attemptCount} + 1`,
        })
        .where(
          and(
            eq(schema.analysisJobs.id, job.id),
            eq(schema.analysisJobs.status, 'pending'),
          ),
        );

      return { ...job, workerRunId, attemptCount: job.attemptCount + 1 };
    });

    if (!claimResult) {
      ctx.log.info('No pending analysis jobs — done.');
      break;
    }

    const job = claimResult;
    ctx.log.info('Claimed analysis job', { jobId: job.id, userId: job.userId, traceId: job.traceId });

    // Refresh the lease while a long analysis is running. `updatedAt` is
    // the existing lease timestamp, so no migration is required.
    const leaseHeartbeat = setInterval(() => {
      void db
        .update(schema.analysisJobs)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(schema.analysisJobs.id, job.id),
            eq(schema.analysisJobs.status, 'running'),
            eq(schema.analysisJobs.workerRunId, job.workerRunId),
          ),
        )
        .catch((err) => ctx.log.warn('Analysis job lease heartbeat failed', { err: String(err) }));
    }, 30_000);
    leaseHeartbeat.unref();

    // OBS-1: If the web request attached a diagnostic traceId, wrap the
    // entire job processing in the traceId context so all log lines from
    // this worker run carry the same traceId as the originating chat turn.
    const processJob = async () => {
      const progressEvents: Array<Record<string, unknown>> = [];
      let progressWrite = Promise.resolve();
      try {
        // Dynamically import the multi-agent orchestrator — the worker
        // bundle includes @kestrel/ai (used by initLangfuse).
        const {
          runMultiAgentChat,
          extractUserMessageText,
          resolveMode,
          getThread,
          listMessages,
          withDiagnostics,
        } = await import('@kestrel/ai');
        const { userSettings: userSettingsTable } = schema;

      // Load user settings and identity for the same prompt context used by
      // the synchronous web path.
      const [[userSettings], [userRow]] = await Promise.all([
        db
          .select()
          .from(userSettingsTable)
          .where(eq(userSettingsTable.userId, job.userId)),
        db
          .select({ name: schema.users.name, email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, job.userId)),
      ]);

      if (!userSettings) {
        throw new Error(`User settings not found for userId=${job.userId}`);
      }

      // Reconstruct the user message from serialized parts. Older callers
      // may provide only content, so preserve the stored text as a reliable
      // fallback instead of silently sending an empty prompt to every agent.
      const storedParts = Array.isArray(job.userMessageParts) ? job.userMessageParts : [];
      const hasTextPart = storedParts.some(
        (part) => typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text',
      );
      const userMessageParts = hasTextPart
        ? storedParts
        : [...storedParts, { type: 'text', text: job.userMessageText }];
      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: userMessageParts as UIMessage['parts'],
      } as UIMessage;

      const thread = await getThread(job.userId, job.threadId);
      if (!thread) {
        throw new Error(`Analysis job thread not found or not owned by user: ${job.threadId}`);
      }
      // Use authoritative persisted history rather than trusting the
      // client-supplied snapshot stored on the queued job.
      const persistedHistory = await listMessages(job.userId, job.threadId, 200);
      const history = reconstructHistory(persistedHistory);

      // Extract user text and resolve mode from the queued mode value.
      // The route handler already resolved this to a non-'single' mode
      // before queueing, so we use the stored mode to avoid re-detecting.
      const userText = extractUserMessageText(userMessage);
      // A queued job already carries the user's explicit mode. Never run
      // auto-detection over an explicit full request: doing so can silently
      // turn a queued full analysis into standard and start only two agents.
      const queuedMode = (job.mode as AnalysisMode) ?? 'full';
      const resolvedMode = queuedMode === 'full'
        ? 'full'
        : resolveMode(queuedMode, userText);

      // Build progress snapshots in the same data-stream shape consumed by
      // the browser transport. The orchestrator emits raw lifecycle events,
      // while the polling client expects `data-agent-progress` snapshots.
      let progressTracker: ProgressTracker | null = null;
      const onProgress = (event: ProgressEvent) => {
        if (event.type === 'specialists_start' && resolvedMode === 'full' && event.agents.length !== 4) {
          throw new Error(`Full mode invariant violated: expected 4 specialists, received ${event.agents.length}`);
        }
        if (event.type === 'specialists_start') {
          // Create the tracker from the actual effective specialist list so
          // a budget-driven full → standard downgrade does not leave phantom
          // agents stuck in `pending` state.
          progressTracker = new ProgressTracker(resolvedMode, event.agents);
        }
        progressTracker ??= new ProgressTracker(resolvedMode, selectAgents(resolvedMode));
        const publicEvent = event.type === 'agent_error'
          ? { ...event, error: 'Agent unavailable. Please try again.' }
          : event.type === 'fusion_error'
            ? { ...event, error: 'Decision agent unavailable. Specialist fallback is being prepared.' }
            : event;
        progressTracker.update(publicEvent);
        const snapshot = progressTracker.buildPart() as unknown as Record<string, unknown>;
        progressEvents.push(snapshot);

        // Serialize progress writes. Without this chain, an earlier async
        // update could finish after the final status update and overwrite the
        // latest progress snapshot.
        progressWrite = progressWrite.then(async () => {
          try {
            await db
              .update(schema.analysisJobs)
              .set({ progress: progressEvents, updatedAt: new Date() })
              .where(
                and(
                  eq(schema.analysisJobs.id, job.id),
                  eq(schema.analysisJobs.status, 'running'),
                  eq(schema.analysisJobs.workerRunId, job.workerRunId),
                ),
              );
          } catch (err) {
            ctx.log.warn('Failed to update progress', { err: String(err) });
          }
        });
      };

      // Run the multi-agent pipeline. Uses the shared pickAiEnv helper
      // so the worker always passes the same env shape as the web route.
      const env = pickAiEnv(process.env as unknown as Parameters<typeof pickAiEnv>[0]);

      const result = await withDiagnostics(job.userId, job.threadId, () => runMultiAgentChat({
        threadId: job.threadId,
        userId: job.userId,
        userMessage,
        history,
        userSettings,
        displayName: userRow?.name?.trim() || (userRow?.email ? userRow.email.split('@')[0] : null) || null,
        ...(userSettings.customInstructions ? { customInstructions: userSettings.customInstructions } : {}),
        env,
        signal: ctx.signal ?? null,
        analysisMode: resolvedMode,
        idempotencyKey: `analysis-job:${job.id}`,
        onProgress,
      }), {
        ...(job.traceId ? { traceId: job.traceId } : {}),
        runId: job.workerRunId,
        jobId: job.id,
      });

      // Ensure all progress snapshots have reached the database before the
      // terminal status is written.
      await progressWrite;

      // Mark as complete.
      const completedRows = await db
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
        .where(
          and(
            eq(schema.analysisJobs.id, job.id),
            eq(schema.analysisJobs.status, 'running'),
            eq(schema.analysisJobs.workerRunId, job.workerRunId),
          ),
        )
        .returning({ id: schema.analysisJobs.id });

      if (completedRows.length !== 1) {
        ctx.log.warn('Analysis job completion skipped because the lease was lost', {
          jobId: job.id,
          workerRunId: job.workerRunId,
        });
        return;
      }

      ctx.log.info('Analysis job completed', { jobId: job.id, workerRunId: job.workerRunId, costUsd: result.totalCostUsd, latencyMs: result.totalLatencyMs });
      processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const retryable = isRetryableAnalysisError(err) && job.attemptCount < MAX_ANALYSIS_ATTEMPTS;
        const nextStatus = retryable ? 'pending' : 'failed';
        const nextError = retryable
          ? `Attempt ${job.attemptCount}/${MAX_ANALYSIS_ATTEMPTS} failed; retrying automatically.`
          : msg;
        ctx.log.error('Analysis job failed', {
          jobId: job.id,
          err: msg,
          retryable,
          attempt: job.attemptCount,
        });

      await progressWrite;
      const failedRows = await db
        .update(schema.analysisJobs)
        .set({
          status: nextStatus,
          error: nextError,
          completedAt: retryable ? null : new Date(),
          startedAt: retryable ? null : job.startedAt,
          workerRunId: retryable ? null : job.workerRunId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.analysisJobs.id, job.id),
            eq(schema.analysisJobs.status, 'running'),
            eq(schema.analysisJobs.workerRunId, job.workerRunId),
          ),
        )
        .returning({ id: schema.analysisJobs.id });

      if (failedRows.length !== 1) {
        ctx.log.warn('Analysis job failure update skipped because the lease was lost', {
          jobId: job.id,
          workerRunId: job.workerRunId,
        });
      }
      processed++;
      }
    };

    // OBS-1: Run job processing inside the traceId context when available.
    try {
      if (job.traceId) {
        await traceIdStorage.run(job.traceId, processJob);
      } else {
        await processJob();
      }
    } finally {
      clearInterval(leaseHeartbeat);
    }
  }

  // Requeue stale leases while attempts remain. Terminal writes are
  // lease-token-conditional, so an old worker cannot resurrect a job after
  // this cleanup changes it back to pending. Jobs that exhausted their
  // bounded attempts become failed and remain visible to the client.
  const staleCutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
  await db
    .update(schema.analysisJobs)
    .set({
      status: 'pending',
      error: 'Worker lease expired; retrying automatically.',
      startedAt: null,
      workerRunId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.analysisJobs.status, 'running'),
        lt(schema.analysisJobs.updatedAt, staleCutoff),
        sql`${schema.analysisJobs.attemptCount} < ${MAX_ANALYSIS_ATTEMPTS}`,
      ),
    );

  await db
    .update(schema.analysisJobs)
    .set({
      status: 'failed',
      error: 'Job timed out — maximum worker attempts reached.',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.analysisJobs.status, 'running'),
        lt(schema.analysisJobs.updatedAt, staleCutoff),
        sql`${schema.analysisJobs.attemptCount} >= ${MAX_ANALYSIS_ATTEMPTS}`,
      ),
    );

  // Clean up old completed/failed jobs older than 7 days.
  const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    await db
      .delete(schema.analysisJobs)
      .where(lt(schema.analysisJobs.completedAt, retentionCutoff));
  } catch (err) {
    ctx.log.warn('Analysis job retention cleanup failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  ctx.log.info('Analysis job poll complete', { processed });

  return { processed, note: `processed=${processed}` };
}
