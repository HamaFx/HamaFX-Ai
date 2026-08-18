// SPDX-License-Identifier: Apache-2.0

import { and, desc, gte, lte } from 'drizzle-orm';

import { getDb, schema } from '../client';
import type {
  ShadowComparisonAgent,
  ShadowComparisonOutcome,
  ShadowOverlap,
} from '../schema/ai-shadow-comparisons';

export type AiShadowComparisonRow = typeof schema.aiShadowComparisons.$inferSelect;

export interface RecordAiShadowComparisonInput {
  userId: string;
  threadId: string;
  promptSha256: string;
  primaryAgent: ShadowComparisonAgent;
  outcome: ShadowComparisonOutcome;
  failureReason?: string | null;
  legacyChars?: number | null;
  mastraChars?: number | null;
  sharedTokenRatio?: number | null;
  overlap?: ShadowOverlap | null;
  mastraVerified?: boolean | null;
  mastraBias?: string | null;
  mastraDataQuality?: string | null;
  primaryLatencyMs?: number | null;
  shadowLatencyMs?: number | null;
  primaryCostUsd?: number | null;
  shadowCostUsd?: number | null;
}

export async function recordAiShadowComparison(
  input: RecordAiShadowComparisonInput,
): Promise<AiShadowComparisonRow> {
  const [row] = await getDb()
    .insert(schema.aiShadowComparisons)
    .values({
      userId: input.userId,
      threadId: input.threadId,
      promptSha256: input.promptSha256,
      primaryAgent: input.primaryAgent,
      outcome: input.outcome,
      failureReason: input.failureReason ?? null,
      legacyChars: input.legacyChars ?? null,
      mastraChars: input.mastraChars ?? null,
      sharedTokenRatio: input.sharedTokenRatio ?? null,
      overlap: input.overlap ?? null,
      mastraVerified: input.mastraVerified ?? null,
      mastraBias: input.mastraBias ?? null,
      mastraDataQuality: input.mastraDataQuality ?? null,
      primaryLatencyMs: input.primaryLatencyMs ?? null,
      shadowLatencyMs: input.shadowLatencyMs ?? null,
      primaryCostUsd: input.primaryCostUsd ?? null,
      shadowCostUsd: input.shadowCostUsd ?? null,
    })
    .returning();

  if (!row) throw new Error('shadow comparison insert returned no row');
  return row;
}

export interface ListAiShadowComparisonsOptions {
  limit?: number;
  from?: Date;
  to?: Date;
}

export async function listAiShadowComparisons(
  options: ListAiShadowComparisonsOptions = {},
): Promise<AiShadowComparisonRow[]> {
  const conditions = [];
  if (options.from) conditions.push(gte(schema.aiShadowComparisons.createdAt, options.from));
  if (options.to) conditions.push(lte(schema.aiShadowComparisons.createdAt, options.to));

  return getDb()
    .select()
    .from(schema.aiShadowComparisons)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.aiShadowComparisons.createdAt))
    .limit(Math.min(500, Math.max(1, options.limit ?? 100)));
}

export interface AiShadowComparisonSummary {
  total: number;
  completed: number;
  failed: number;
  mastraPrimary: number;
  legacyPrimary: number;
  verifiedReports: number;
  averageSharedTokenRatio: number | null;
  averagePrimaryLatencyMs: number | null;
  averageShadowLatencyMs: number | null;
  averagePrimaryCostUsd: number | null;
  averageShadowCostUsd: number | null;
  overlapCounts: Record<ShadowOverlap, number>;
  failureReasons: Record<string, number>;
}

export function summarizeAiShadowComparisons(
  rows: readonly AiShadowComparisonRow[],
): AiShadowComparisonSummary {
  const overlapCounts: Record<ShadowOverlap, number> = { none: 0, low: 0, medium: 0, high: 0 };
  const failureReasons: Record<string, number> = {};
  let ratioSum = 0;
  let ratioCount = 0;
  let primaryLatencySum = 0;
  let primaryLatencyCount = 0;
  let shadowLatencySum = 0;
  let shadowLatencyCount = 0;
  let primaryCostSum = 0;
  let primaryCostCount = 0;
  let shadowCostSum = 0;
  let shadowCostCount = 0;

  for (const row of rows) {
    if (row.overlap) overlapCounts[row.overlap] += 1;
    if (row.failureReason) failureReasons[row.failureReason] = (failureReasons[row.failureReason] ?? 0) + 1;
    if (row.sharedTokenRatio !== null) {
      ratioSum += Number(row.sharedTokenRatio);
      ratioCount += 1;
    }
    if (row.primaryLatencyMs !== null) {
      primaryLatencySum += row.primaryLatencyMs;
      primaryLatencyCount += 1;
    }
    if (row.shadowLatencyMs !== null) {
      shadowLatencySum += row.shadowLatencyMs;
      shadowLatencyCount += 1;
    }
    if (row.primaryCostUsd !== null) {
      primaryCostSum += Number(row.primaryCostUsd);
      primaryCostCount += 1;
    }
    if (row.shadowCostUsd !== null) {
      shadowCostSum += Number(row.shadowCostUsd);
      shadowCostCount += 1;
    }
  }

  return {
    total: rows.length,
    completed: rows.filter((row) => row.outcome === 'completed').length,
    failed: rows.filter((row) => row.outcome === 'failed').length,
    mastraPrimary: rows.filter((row) => row.primaryAgent === 'mastra').length,
    legacyPrimary: rows.filter((row) => row.primaryAgent === 'legacy').length,
    verifiedReports: rows.filter((row) => row.mastraVerified === true).length,
    averageSharedTokenRatio: ratioCount > 0 ? ratioSum / ratioCount : null,
    averagePrimaryLatencyMs: primaryLatencyCount > 0 ? primaryLatencySum / primaryLatencyCount : null,
    averageShadowLatencyMs: shadowLatencyCount > 0 ? shadowLatencySum / shadowLatencyCount : null,
    averagePrimaryCostUsd: primaryCostCount > 0 ? primaryCostSum / primaryCostCount : null,
    averageShadowCostUsd: shadowCostCount > 0 ? shadowCostSum / shadowCostCount : null,
    overlapCounts,
    failureReasons,
  };
}
