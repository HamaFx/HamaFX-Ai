// SPDX-License-Identifier: Apache-2.0

import 'server-only';

import { createHash } from 'node:crypto';

import {
  DEFAULT_MAX_DAILY_USD,
  consumeUIMessageStream,
  estimateCostUsd,
  reserveTurnBudget,
} from '@kestrel/ai';
import { runChat } from '@kestrel/ai/agent';
import type { RunChatArgs } from '@kestrel/ai/types';
import type { UIMessage } from 'ai';
import type { XauusdResearchReport } from '@kestrel/ai/mastra';
import { runMastraXauusdResearch } from './mastra-xauusd';
import { metrics } from '@kestrel/shared';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import {
  getUserWithSettings,
  recordAiShadowComparison,
} from '@kestrel/db';

import { getServerEnv } from '@/lib/env';

export const MASTRA_SHADOW_TIMEOUT_MS = 30_000;

const slog = createCategorizedLogger('ai', { component: 'mastra-xauusd-shadow' });

export type ShadowOverlapBucket = 'none' | 'low' | 'medium' | 'high';

export interface MastraShadowComparison {
  legacyChars: number;
  mastraChars: number;
  sharedTokenRatio: number;
  overlap: ShadowOverlapBucket;
  mastraVerified: boolean;
  mastraBias: 'bullish' | 'bearish' | 'neutral' | 'unclear' | null;
  mastraDataQuality: 'complete' | 'partial' | 'degraded' | null;
}

export interface RunMastraShadowComparisonInput {
  userId: string;
  threadId: string;
  prompt: string;
  legacyText: string;
}

export interface RunLegacyShadowComparisonInput {
  userId: string;
  threadId: string;
  prompt: string;
  userMessage: UIMessage;
  mastraText: string;
  report: XauusdResearchReport | null;
  mastraCostUsd?: number;
  mastraLatencyMs?: number;
}

function normalizedTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 3)
      ?? [],
  );
}

/**
 * Compare only aggregate, non-sensitive characteristics. Raw legacy or Mastra
 * text is never logged or persisted by this module.
 */
export function compareMastraShadowTexts(
  legacyText: string,
  mastraText: string,
  report: { bias: MastraShadowComparison['mastraBias']; dataQuality: MastraShadowComparison['mastraDataQuality'] } | null,
): MastraShadowComparison {
  const legacyTokens = normalizedTokens(legacyText);
  const mastraTokens = normalizedTokens(mastraText);
  const shared = [...legacyTokens].filter((token) => mastraTokens.has(token)).length;
  const denominator = Math.max(1, Math.min(legacyTokens.size, mastraTokens.size));
  const sharedTokenRatio = shared / denominator;
  const overlap: ShadowOverlapBucket = sharedTokenRatio === 0
    ? 'none'
    : sharedTokenRatio < 0.2
      ? 'low'
      : sharedTokenRatio < 0.5
        ? 'medium'
        : 'high';

  return {
    legacyChars: legacyText.length,
    mastraChars: mastraText.length,
    sharedTokenRatio: Number(sharedTokenRatio.toFixed(4)),
    overlap,
    mastraVerified: report !== null,
    mastraBias: report?.bias ?? null,
    mastraDataQuality: report?.dataQuality ?? null,
  };
}

function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex');
}

async function persistComparisonSafely(input: Parameters<typeof recordAiShadowComparison>[0]): Promise<void> {
  try {
    await recordAiShadowComparison(input);
  } catch (error) {
    slog.warn('Shadow comparison persistence failed', {
      threadId: input.threadId,
      error: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

function recordShadowFailure(outcome: 'failed' | 'skipped', reason: string): void {
  metrics.increment('mastra_shadow_total', { tags: { outcome, reason } });
  metrics.increment(
    outcome === 'failed' ? 'mastra_shadow_failed_total' : 'mastra_shadow_skipped_total',
    { tags: { reason } },
  );
}

/**
 * Run Mastra beside an already-completed legacy turn. This function never
 * throws to the chat request, never appends messages, and uses a bounded
 * budget reservation so shadow traffic cannot bypass the user's daily cap.
 */
export async function runMastraShadowComparison(
  input: RunMastraShadowComparisonInput,
): Promise<MastraShadowComparison | null> {
  const startedAt = Date.now();
  let budget: Awaited<ReturnType<typeof reserveTurnBudget>> | null = null;

  try {
    const { settings } = await getUserWithSettings(input.userId);
    if (!settings) {
      recordShadowFailure('skipped', 'missing-settings');
      return null;
    }

    const env = getServerEnv();
    try {
      budget = await reserveTurnBudget({
        userId: input.userId,
        maxDailyUsd: settings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD,
      });
    } catch (error) {
      recordShadowFailure('skipped', 'budget');
      slog.info('Mastra shadow skipped by budget guard', {
        threadId: input.threadId,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      return null;
    }

    const shadowRunId = `shadow-${crypto.randomUUID()}`;
    const result = await runMastraXauusdResearch({
      userId: input.userId,
      threadId: input.threadId,
      runId: shadowRunId,
      prompt: input.prompt,
      signal: AbortSignal.timeout(MASTRA_SHADOW_TIMEOUT_MS),
      telemetryKind: 'mastra_xauusd_shadow',
    });
    const observedCost = estimateCostUsd(
      result.modelId,
      result.stats.inputTokens,
      result.stats.outputTokens,
    );
    await budget.reconcile(observedCost);
    budget = null;

    const comparison = compareMastraShadowTexts(
      input.legacyText,
      result.result.text,
      result.report
        ? { bias: result.report.bias, dataQuality: result.report.dataQuality }
        : null,
    );
    await persistComparisonSafely({
      userId: input.userId,
      threadId: input.threadId,
      promptSha256: promptHash(input.prompt),
      primaryAgent: 'legacy',
      outcome: 'completed',
      legacyChars: comparison.legacyChars,
      mastraChars: comparison.mastraChars,
      sharedTokenRatio: comparison.sharedTokenRatio,
      overlap: comparison.overlap,
      mastraVerified: comparison.mastraVerified,
      mastraBias: comparison.mastraBias,
      mastraDataQuality: comparison.mastraDataQuality,
      shadowLatencyMs: Date.now() - startedAt,
      shadowCostUsd: observedCost,
    });
    metrics.increment('mastra_shadow_total', {
      tags: {
        outcome: 'completed',
        overlap: comparison.overlap,
        dataQuality: comparison.mastraDataQuality ?? 'unknown',
      },
    });
    metrics.observe('total_latency_ms', Date.now() - startedAt, {
      tags: { agent: 'mastra-xauusd-shadow' },
    });
    slog.info('Mastra shadow comparison completed', {
      threadId: input.threadId,
      runId: shadowRunId,
      legacyChars: comparison.legacyChars,
      mastraChars: comparison.mastraChars,
      sharedTokenRatio: comparison.sharedTokenRatio,
      overlap: comparison.overlap,
      mastraVerified: comparison.mastraVerified,
      mastraBias: comparison.mastraBias,
      dataQuality: comparison.mastraDataQuality,
      durationMs: Date.now() - startedAt,
    });
    return comparison;
  } catch (error) {
    if (budget) {
      try {
        await budget.release();
      } catch (releaseError) {
        slog.warn('Mastra shadow budget release failed', {
          threadId: input.threadId,
          error: releaseError instanceof Error ? releaseError.name : 'UnknownError',
        });
      }
    }
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'run';
    await persistComparisonSafely({
      userId: input.userId,
      threadId: input.threadId,
      promptSha256: promptHash(input.prompt),
      primaryAgent: 'legacy',
      outcome: 'failed',
      failureReason: reason,
      shadowLatencyMs: Date.now() - startedAt,
    });
    recordShadowFailure('failed', reason);
    slog.warn('Mastra shadow comparison failed; legacy response is unaffected', {
      threadId: input.threadId,
      error: error instanceof Error ? error.name : 'UnknownError',
      durationMs: Date.now() - startedAt,
    });
    return null;
  }
}

/**
 * Run the legacy agent beside a user-facing Mastra report. The legacy pipeline
 * receives the authenticated prompt in memory but is forbidden from writing
 * chat messages, titles, or assistant responses to the thread.
 */
export async function runLegacyShadowComparison(
  input: RunLegacyShadowComparisonInput,
): Promise<MastraShadowComparison | null> {
  const startedAt = Date.now();
  try {
    const shadowEnv: RunChatArgs['env'] = getServerEnv();
    const legacyRun = await runChat({
      userId: input.userId,
      threadId: input.threadId,
      userMessage: input.userMessage,
      env: shadowEnv,
      persistMessages: false,
      telemetryKind: 'legacy_shadow',
      excludeMessageIdempotencyKeys: [`mastra:${input.threadId}:${input.userMessage.id}:assistant`],
      signal: AbortSignal.timeout(MASTRA_SHADOW_TIMEOUT_MS),
    });
    const legacy = await consumeUIMessageStream(legacyRun.toUIMessageStreamResponse());
    if (legacy.errors.length > 0) {
      throw new Error('legacy shadow stream reported an error');
    }

    const comparison = compareMastraShadowTexts(
      legacy.text,
      input.mastraText,
      input.report
        ? { bias: input.report.bias, dataQuality: input.report.dataQuality }
        : null,
    );
    await persistComparisonSafely({
      userId: input.userId,
      threadId: input.threadId,
      promptSha256: promptHash(input.prompt),
      primaryAgent: 'mastra',
      outcome: 'completed',
      legacyChars: comparison.legacyChars,
      mastraChars: comparison.mastraChars,
      sharedTokenRatio: comparison.sharedTokenRatio,
      overlap: comparison.overlap,
      mastraVerified: comparison.mastraVerified,
      mastraBias: comparison.mastraBias,
      mastraDataQuality: comparison.mastraDataQuality,
      primaryLatencyMs: input.mastraLatencyMs ?? null,
      primaryCostUsd: input.mastraCostUsd ?? null,
      shadowLatencyMs: Date.now() - startedAt,
    });
    metrics.increment('mastra_shadow_total', {
      tags: {
        outcome: 'completed',
        side: 'legacy',
        overlap: comparison.overlap,
        dataQuality: comparison.mastraDataQuality ?? 'unknown',
      },
    });
    metrics.observe('total_latency_ms', Date.now() - startedAt, {
      tags: { agent: 'legacy-shadow' },
    });
    slog.info('Legacy shadow comparison completed', {
      threadId: input.threadId,
      legacyChars: comparison.legacyChars,
      mastraChars: comparison.mastraChars,
      sharedTokenRatio: comparison.sharedTokenRatio,
      overlap: comparison.overlap,
      mastraVerified: comparison.mastraVerified,
      durationMs: Date.now() - startedAt,
    });
    return comparison;
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'legacy-run';
    await persistComparisonSafely({
      userId: input.userId,
      threadId: input.threadId,
      promptSha256: promptHash(input.prompt),
      primaryAgent: 'mastra',
      outcome: 'failed',
      failureReason: reason,
      primaryLatencyMs: input.mastraLatencyMs ?? null,
      primaryCostUsd: input.mastraCostUsd ?? null,
      shadowLatencyMs: Date.now() - startedAt,
    });
    metrics.increment('mastra_shadow_total', {
      tags: { outcome: 'failed', side: 'legacy' },
    });
    metrics.increment('mastra_shadow_failed_total', {
      tags: { reason },
    });
    slog.warn('Legacy shadow comparison failed; Mastra response is unaffected', {
      threadId: input.threadId,
      error: error instanceof Error ? error.name : 'UnknownError',
      durationMs: Date.now() - startedAt,
    });
    return null;
  }
}
