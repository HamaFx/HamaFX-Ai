import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAiShadowComparisons: vi.fn(),
  summarizeAiShadowComparisons: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    (req: Request) => handler(req, { user: { userId: 'admin-1' } }),
}));

vi.mock('@/lib/api', () => ({
  parseSearchParams: (req: Request, schema: { parse: (value: Record<string, string>) => unknown }) => {
    const url = new URL(req.url);
    return schema.parse(Object.fromEntries(url.searchParams.entries()));
  },
}));

vi.mock('@/lib/services/api-boundary', () => ({
  listAiShadowComparisons: mocks.listAiShadowComparisons,
  summarizeAiShadowComparisons: mocks.summarizeAiShadowComparisons,
}));

import { GET } from '@/app/api/admin/ai-shadow/route';

const row = {
  id: 'comparison-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  threadId: 'thread-1',
  promptSha256: 'a'.repeat(64),
  primaryAgent: 'mastra',
  outcome: 'completed',
  failureReason: null,
  legacyChars: 10,
  mastraChars: 20,
  sharedTokenRatio: 0.5,
  overlap: 'medium',
  mastraVerified: true,
  mastraBias: 'bullish',
  mastraDataQuality: 'complete',
  primaryLatencyMs: 100,
  shadowLatencyMs: 200,
  primaryCostUsd: 0.01,
  shadowCostUsd: 0.02,
  createdAt: new Date('2026-08-18T12:00:00.000Z'),
};

describe('GET /api/admin/ai-shadow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAiShadowComparisons.mockResolvedValue([row]);
    mocks.summarizeAiShadowComparisons.mockReturnValue({ total: 1 });
  });

  it('returns an admin-readable summary and strips Date objects for JSON', async () => {
    const response = await GET(new Request('http://localhost/api/admin/ai-shadow?hours=24&limit=10'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listAiShadowComparisons).toHaveBeenCalledWith({
      limit: 10,
      from: expect.any(Date),
    });
    expect(body).toEqual({
      hours: 24,
      summary: { total: 1 },
      comparisons: [{
        id: row.id,
        threadId: row.threadId,
        promptSha256: row.promptSha256,
        primaryAgent: row.primaryAgent,
        outcome: row.outcome,
        failureReason: row.failureReason,
        legacyChars: row.legacyChars,
        mastraChars: row.mastraChars,
        sharedTokenRatio: row.sharedTokenRatio,
        overlap: row.overlap,
        mastraVerified: row.mastraVerified,
        mastraBias: row.mastraBias,
        mastraDataQuality: row.mastraDataQuality,
        primaryLatencyMs: row.primaryLatencyMs,
        shadowLatencyMs: row.shadowLatencyMs,
        primaryCostUsd: row.primaryCostUsd,
        shadowCostUsd: row.shadowCostUsd,
        createdAt: '2026-08-18T12:00:00.000Z',
      }],
    });
  });
});
