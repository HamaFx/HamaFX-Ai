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

// Durable full-analysis worker (Phase 3). The queue is Mastra workflow run
// records: the web writes a pending `full-analysis` run snapshot, this job
// claims it (status → running + lease token), executes the symbol-research
// workflow under that exact runId, and writes the terminal status + shaped
// result back into the same record. No analysis_jobs table; no heartbeat
// hand-rolling — `touchFullAnalysisRun` bumps the run's `updatedAt` lease.

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
  claimNextFullAnalysisRun,
  maybeGenerateThreadTitle,
  completeFullAnalysisRun,
  failFullAnalysisRun,
  purgeOldFullAnalysisRuns,
  recoverStaleFullAnalysisRuns,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
  FULL_ANALYSIS_WORKFLOW_ID,
  type FullAnalysisPayload,
} from '@kestrel/ai/mastra';
import {
  extractSymbolFromPrompt,
  isSafeSymbolResearchPrompt,
  runMastraMode,
} from '@kestrel/ai/mastra';
import { schema } from '@kestrel/db';
import { pickAiEnv } from '@kestrel/shared';
import { traceIdStorage } from '@kestrel/shared/logger';
import type { UIMessage } from 'ai';
import { eq } from 'drizzle-orm';

import type { JobContext, JobResult } from './types.js';

const MAX_JOBS_PER_RUN = 3;
const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_ANALYSIS_ATTEMPTS = 3;
const HEARTBEAT_MS = 30_000;
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

function userMessageFromPayload(payload: FullAnalysisPayload): UIMessage {
  const storedParts = Array.isArray(payload.userMessageParts) ? payload.userMessageParts : [];
  const hasTextPart = storedParts.some(
    (part) =>
      typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text',
  );
  const parts = hasTextPart
    ? storedParts
    : [...storedParts, { type: 'text', text: payload.userMessageText }];
  return {
    id: crypto.randomUUID(),
    role: 'user',
    parts: parts as UIMessage['parts'],
  } as UIMessage;
}

export async function runMultiAgentAnalysis(ctx: JobContext): Promise<JobResult> {
  const db = getDb();
  const workerRunId = `${process.env.HOSTNAME ?? 'worker'}-${crypto.randomUUID()}`;
  let processed = 0;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const claimed = await claimNextFullAnalysisRun(workerRunId);
    if (!claimed) {
      ctx.log.info('No pending full-analysis runs — done.');
      break;
    }
    const { runId, payload } = claimed;
    ctx.log.info('Claimed full-analysis run', {
      runId,
      userId: payload.userId,
      threadId: payload.threadId,
      traceId: payload.traceId,
      attempt: payload.attemptCount,
    });

    const leaseHeartbeat = setInterval(() => {
      void touchFullAnalysisRun(runId).catch((error) =>
        ctx.log.warn('Full-analysis lease heartbeat failed', { err: String(error) }),
      );
    }, HEARTBEAT_MS);
    leaseHeartbeat.unref();

    const processRun = async () => {
      let budget: BudgetHandle | null = null;
      let modeResult: Awaited<ReturnType<typeof runMastraMode>> | null = null;
      let observedCost = 0;
      try {
        const [[userSettings]] = await Promise.all([
          db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, payload.userId)),
        ]);
        if (!userSettings) {
          throw new Error(`User settings not found for userId=${payload.userId}`);
        }

        const userMessage = userMessageFromPayload(payload);
        const userText = payload.userMessageText;
        const symbol = extractSymbolFromPrompt(userText, userSettings.defaultSymbol ?? 'XAUUSD');
        if (!symbol || !isSafeSymbolResearchPrompt(userText)) {
          throw new Error(
            'Full analysis requires one supported symbol and a read-only research request.',
          );
        }

        const env = pickAiEnv(process.env as unknown as Parameters<typeof pickAiEnv>[0]);
        budget = await reserveTurnBudget({
          userId: payload.userId,
          estimateUsd: 0.05,
          maxDailyUsd: userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
          correlation: { threadId: payload.threadId, runId },
        });

        await appendUserMessage(payload.userId, payload.threadId, userMessage, {
          idempotencyKey: `analysis-job:${runId}:user`,
        });

        modeResult = await withDiagnostics(
          payload.userId,
          payload.threadId,
          () =>
            runMastraMode({
              prompt: userText,
              symbol,
              userId: payload.userId,
              threadId: payload.threadId,
              runId,
              mode: 'full',
              workflowId: FULL_ANALYSIS_WORKFLOW_ID,
              settings: userSettings,
              env,
              signal: ctx.signal,
              telemetryKind: 'mastra_full_job',
            }),
          {
            ...(payload.traceId ? { traceId: payload.traceId } : {}),
            runId,
            jobId: runId,
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
          payload.userId,
          payload.threadId,
          assistant,
          { idempotencyKey: `analysis-job:${runId}:assistant` },
        );

        void maybeGenerateThreadTitle({
          userId: payload.userId,
          threadId: payload.threadId,
          firstUser: userText,
          firstAssistant: modeResult.finalText,
          env,
        });

        await completeFullAnalysisRun(runId, {
          finalText: modeResult.finalText,
          agentOpinions: modeResult.agentOpinions,
          mode: modeResult.mode,
          totalCostUsd: modeResult.totalCostUsd,
          totalLatencyMs: modeResult.totalLatencyMs,
          messageId: persistedAssistant.messageId,
        });

        await budget.reconcile(observedCost);
        budget = null;
        processed++;
        ctx.log.info('Full analysis job completed', {
          runId,
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
        if (payload.traceId) await traceIdStorage.run(payload.traceId, processRun);
        else await processRun();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable = isRetryableAnalysisError(error) && payload.attemptCount < MAX_ANALYSIS_ATTEMPTS;
        ctx.log.error('Full analysis job failed', {
          runId,
          err: message,
          retryable,
          attempt: payload.attemptCount,
        });
        if (retryable) {
          await requeueFullAnalysisRun(
            runId,
            `Attempt ${payload.attemptCount}/${MAX_ANALYSIS_ATTEMPTS} failed; retrying automatically.`,
          );
        } else {
          await failFullAnalysisRun(runId, error);
        }
        processed++;
      }
    } finally {
      clearInterval(leaseHeartbeat);
    }
  }

  const staleCutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
  const staleRecovery = await recoverStaleFullAnalysisRuns(staleCutoff, MAX_ANALYSIS_ATTEMPTS);
  if (staleRecovery.requeued > 0 || staleRecovery.failed > 0) {
    ctx.log.warn('Recovered stale full-analysis runs', {
      requeued: staleRecovery.requeued,
      failed: staleRecovery.failed,
      maxAttempts: MAX_ANALYSIS_ATTEMPTS,
    });
  }

  const retentionCutoff = new Date(Date.now() - RETENTION_WINDOW_MS);
  try {
    const purged = await purgeOldFullAnalysisRuns(retentionCutoff);
    if (purged > 0) ctx.log.info('Purged old full-analysis runs', { purged });
  } catch (error) {
    ctx.log.warn('Full-analysis run retention cleanup failed', { err: String(error) });
  }

  ctx.log.info('Full-analysis poll complete', { processed });
  return { processed, note: `processed=${processed}` };
}
