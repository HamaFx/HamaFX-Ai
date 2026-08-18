import { describe, expect, it } from 'vitest';

import {
  summarizeAiShadowComparisons,
  type AiShadowComparisonRow,
} from '../src/queries/ai-shadow-comparisons';

function row(overrides: Partial<AiShadowComparisonRow> = {}): AiShadowComparisonRow {
  return {
    id: 'comparison-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    threadId: 'thread-1',
    promptSha256: 'a'.repeat(64),
    primaryAgent: 'mastra',
    outcome: 'completed',
    failureReason: null,
    legacyChars: 100,
    mastraChars: 120,
    sharedTokenRatio: 0.5,
    overlap: 'medium',
    mastraVerified: true,
    mastraBias: 'bullish',
    mastraDataQuality: 'complete',
    primaryLatencyMs: 1000,
    shadowLatencyMs: 1500,
    primaryCostUsd: 0.01,
    shadowCostUsd: 0.02,
    createdAt: new Date('2026-08-18T12:00:00.000Z'),
    ...overrides,
  };
}

describe('summarizeAiShadowComparisons', () => {
  it('aggregates completion, quality, overlap, latency, and cost safely', () => {
    const summary = summarizeAiShadowComparisons([
      row(),
      row({
        id: 'comparison-2',
        primaryAgent: 'legacy',
        outcome: 'failed',
        failureReason: 'timeout',
        overlap: 'low',
        mastraVerified: false,
        sharedTokenRatio: null,
        primaryLatencyMs: null,
        shadowLatencyMs: 2500,
        primaryCostUsd: null,
        shadowCostUsd: 0.04,
      }),
    ]);

    expect(summary).toEqual({
      total: 2,
      completed: 1,
      failed: 1,
      mastraPrimary: 1,
      legacyPrimary: 1,
      verifiedReports: 1,
      averageSharedTokenRatio: 0.5,
      averagePrimaryLatencyMs: 1000,
      averageShadowLatencyMs: 2000,
      averagePrimaryCostUsd: 0.01,
      averageShadowCostUsd: 0.03,
      overlapCounts: { none: 0, low: 1, medium: 1, high: 0 },
      failureReasons: { timeout: 1 },
      daily: [{
        date: '2026-08-18',
        total: 2,
        completed: 1,
        failed: 1,
        verifiedReports: 1,
        averageSharedTokenRatio: 0.5,
      }],
    });
  });

  it('returns null averages when no numeric observations exist', () => {
    const summary = summarizeAiShadowComparisons([
      row({
        sharedTokenRatio: null,
        primaryLatencyMs: null,
        shadowLatencyMs: null,
        primaryCostUsd: null,
        shadowCostUsd: null,
        overlap: null,
        mastraVerified: null,
      }),
    ]);

    expect(summary.averageSharedTokenRatio).toBeNull();
    expect(summary.averagePrimaryLatencyMs).toBeNull();
    expect(summary.averageShadowLatencyMs).toBeNull();
    expect(summary.averagePrimaryCostUsd).toBeNull();
    expect(summary.averageShadowCostUsd).toBeNull();
    expect(summary.overlapCounts).toEqual({ none: 0, low: 0, medium: 0, high: 0 });
  });
});
