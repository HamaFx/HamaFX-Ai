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

// Durable full-analysis worker. Mastra owns the specialist workflow; Kestrel
// owns queue claims, leases, retries, budgets, persistence, and idempotency.

import {
  appendAssistantMessage,
  appendUserMessage,
  DEFAULT_MAX_DAILY_USD,
  getDb,
  reserveTurnBudget,
  withDiagnostics,
  type BudgetHandle,
} from '@kestrel/ai';
import {
  extractSymbolFromPrompt,
  isSafeSymbolResearchPrompt,
  runMastraMode,
} from '@kestrel/ai/mastra';
import {
  claimNextPendingJob,
  recoverStaleJobs as recoverStaleAnalysisJobs,
  schema,
} from '@kestrel/db';
import { pickAiEnv } from '@kestrel/shared';
import { traceIdStorage } from '@kestrel/shared/logger';
import type { UIMessage } from 'ai';
import { and, eq, lt } from 'drizzle-orm';

import type { JobContext, JobResult } from './types.js';

const MAX_JOBS_PER_RUN = 3;
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_ANALYSIS_ATTEMPTS = 3;

export function isRetryableAnalysisError(error: unknown): boolean {
  const messages: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    messages.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return /(?:timeout|timed?\s*out|aborted|network|fetch\s*failed|rate\s*limit|too\s*many\s*requests|temporar(?:y|ily)|connection|ECONNRESET|5\d\d)/i.test(
    messages.join(' '),
  );
}

function userMessageFromJob(job: {
  userMessageText: string;
  userMessageParts: unknown;
}): UIMessage {
  const storedParts = Array.isArray(job.userMessageParts) ? job.userMessageParts : [];
  const hasTextPart = storedParts.some(
    (part) =>
      typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text',
  );
  const parts = hasTextPart
    ? storedParts
    : [...storedParts, { type: 'text', text: job.userMessageText }];
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: parts as UIMessage['parts'],
  } as UIMessage;
}

export async function runMultiAgentAnalysis(ctx: JobContext): Promise<JobResult> {
  const db = getDb();
  let processed = 0;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const job = await claimNextPendingJob();
    if (!job) {
      ctx.log.info('No pending analysis jobs — done.');
      break;
    }

    const workerRunId = job.workerRunId;
    if (!workerRunId) {
      ctx.log.error('Claimed analysis job has no worker lease token', { jobId: job.id });
      continue;
    }
    ctx.log.info('Claimed Mastra analysis job', {
      jobId: job.id,
      userId: job.userId,
      traceId: job.traceId,
    });

    const leaseHeartbeat = setInterval(() => {
      void db
        .update(schema.analysisJobs)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(schema.analysisJobs.id, job.id),
            eq(schema.analysisJobs.status, 'running'),
            eq(schema.analysisJobs.workerRunId, workerRunId),
          ),
        )
        .catch((error) =>
          ctx.log.warn('Analysis job lease heartbeat failed', { err: String(error) }),
        );
    }, 30_000);
    leaseHeartbeat.unref();

    const processJob = async () => {
      let budget: BudgetHandle | null = null;
      let modeResult: Awaited<ReturnType<typeof runMastraMode>> | null = null;
      let observedCost = 0;
      try {
        const [[userSettings]] = await Promise.all([
          db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, job.userId)),
        ]);
        if (!userSettings) {
          throw new Error(`User settings not found for userId=${job.userId}`);
        }

        const userMessage = userMessageFromJob(job);
        const userText = job.userMessageText;
        const symbol = extractSymbolFromPrompt(userText, userSettings.defaultSymbol ?? 'XAUUSD');
        if (!symbol || !isSafeSymbolResearchPrompt(userText)) {
          throw new Error(
            'Full analysis requires one supported symbol and a read-only research request.',
          );
        }

        const env = pickAiEnv(process.env as unknown as Parameters<typeof pickAiEnv>[0]);
        budget = await reserveTurnBudget({
          userId: job.userId,
          estimateUsd: 0.05,
          maxDailyUsd: userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
          correlation: { threadId: job.threadId, runId: workerRunId },
        });

        await appendUserMessage(job.userId, job.threadId, userMessage, {
          idempotencyKey: `analysis-job:${job.id}:user`,
        });

        modeResult = await withDiagnostics(
          job.userId,
          job.threadId,
          () =>
            runMastraMode({
              prompt: userText,
              symbol,
              userId: job.userId,
              threadId: job.threadId,
              runId: workerRunId,
              mode: 'full',
              settings: userSettings,
              env,
              signal: ctx.signal,
              telemetryKind: 'mastra_full_job',
            }),
          {
            ...(job.traceId ? { traceId: job.traceId } : {}),
            runId: workerRunId,
            jobId: job.id,
          },
        );
        observedCost = modeResult.totalCostUsd;

        const assistant: UIMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [
            { type: 'text', text: modeResult.finalText },
            {
              type: 'data-multi-agent-meta',
              data: {
                engine: 'mastra',
                mode: modeResult.mode,
                symbol: modeResult.symbol,
                packetId: modeResult.packet.packetId,
                dataQuality: modeResult.packet.dataQuality,
                totalCostUsd: modeResult.totalCostUsd,
                totalLatencyMs: modeResult.totalLatencyMs,
                agentOpinions: modeResult.agentOpinions,
              },
            } as UIMessage['parts'][number],
          ],
        };
        const persistedAssistant = await appendAssistantMessage(
          job.userId,
          job.threadId,
          assistant,
          { idempotencyKey: `analysis-job:${job.id}:assistant` },
        );

        const completedRows = await db
          .update(schema.analysisJobs)
          .set({
            status: 'complete',
            result: {
              finalText: modeResult.finalText,
              agentOpinions: modeResult.agentOpinions,
              mode: modeResult.mode,
              totalCostUsd: modeResult.totalCostUsd,
              totalLatencyMs: modeResult.totalLatencyMs,
              messageId: persistedAssistant.messageId,
            },
            progress: [],
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.analysisJobs.id, job.id),
              eq(schema.analysisJobs.status, 'running'),
              eq(schema.analysisJobs.workerRunId, workerRunId),
            ),
          )
          .returning({ id: schema.analysisJobs.id });

        if (completedRows.length !== 1) {
          ctx.log.warn('Mastra analysis completion skipped because the lease was lost', {
            jobId: job.id,
            workerRunId,
          });
          return;
        }

        await budget.reconcile(observedCost);
        budget = null;
        processed++;
        ctx.log.info('Mastra Full analysis job completed', {
          jobId: job.id,
          workerRunId,
          symbol,
          costUsd: observedCost,
          latencyMs: modeResult.totalLatencyMs,
        });
      } catch (error) {
        if (budget) {
          if (modeResult) await budget.reconcile(observedCost);
          else await budget.release();
          budget = null;
        }
        throw error;
      }
    };

    try {
      try {
        if (job.traceId) await traceIdStorage.run(job.traceId, processJob);
        else await processJob();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          isRetryableAnalysisError(error) && job.attemptCount < MAX_ANALYSIS_ATTEMPTS;
        const nextStatus = retryable ? 'pending' : 'failed';
        ctx.log.error('Mastra analysis job failed', {
          jobId: job.id,
          err: message,
          retryable,
          attempt: job.attemptCount,
        });
        const failedRows = await db
          .update(schema.analysisJobs)
          .set({
            status: nextStatus,
            error: retryable
              ? `Attempt ${job.attemptCount}/${MAX_ANALYSIS_ATTEMPTS} failed; retrying automatically.`
              : 'Full Mastra analysis could not be completed. No partial answer was returned.',
            completedAt: retryable ? null : new Date(),
            startedAt: retryable ? null : job.startedAt,
            workerRunId: retryable ? null : workerRunId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.analysisJobs.id, job.id),
              eq(schema.analysisJobs.status, 'running'),
              eq(schema.analysisJobs.workerRunId, workerRunId),
            ),
          )
          .returning({ id: schema.analysisJobs.id });
        if (failedRows.length !== 1) {
          ctx.log.warn('Mastra analysis failure update skipped because the lease was lost', {
            jobId: job.id,
            workerRunId,
          });
        }
        processed++;
      }
    } finally {
      clearInterval(leaseHeartbeat);
    }
  }

  const staleCutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
  const staleRecovery = await recoverStaleAnalysisJobs(staleCutoff, MAX_ANALYSIS_ATTEMPTS);
  if (staleRecovery.requeued > 0 || staleRecovery.failed > 0) {
    ctx.log.warn('Recovered stale Mastra analysis jobs', {
      requeued: staleRecovery.requeued,
      failed: staleRecovery.failed,
      maxAttempts: MAX_ANALYSIS_ATTEMPTS,
    });
  }

  const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    await db
      .delete(schema.analysisJobs)
      .where(lt(schema.analysisJobs.completedAt, retentionCutoff));
  } catch (error) {
    ctx.log.warn('Analysis job retention cleanup failed', { err: String(error) });
  }

  ctx.log.info('Analysis job poll complete', { processed });
  return { processed, note: `processed=${processed}` };
}
