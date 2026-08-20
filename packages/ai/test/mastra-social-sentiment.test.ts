import { beforeEach, describe, expect, it, vi } from 'vitest';

import { XauusdSocialSentimentInputSchema } from '../src/mastra/social-sentiment-tool';
import { xauusdSocialSentimentTool } from '../src/mastra/tools';

const mocks = vi.hoisted(() => ({
  getAggregatedSentiment: vi.fn(),
}));

vi.mock('../src/sentiment', () => ({
  getSentimentService: vi.fn(() => ({
    getAggregatedSentiment: mocks.getAggregatedSentiment,
  })),
}));
vi.mock('../src/mastra/telemetry', () => ({
  executeMastraTool: vi.fn((_name: string, _context: unknown, fn: () => Promise<unknown>) => fn()),
}));

const context = {
  requestContext: {
    get: (key: string) => ({ userId: 'user-1', runId: 'run-1', threadId: 'thread-1' })[key],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAggregatedSentiment.mockResolvedValue({
    symbol: 'XAUUSD',
    overall: 'bullish',
    overallScore: 0.7,
    contrarianSignal: false,
    contrarianNote: null,
    fetchedAt: Date.now(),
    sources: [
      {
        source: 'retail_positioning',
        sentiment: 'bullish',
        score: 0.7,
        retailLongPct: 42,
        sampleSize: 100,
        available: true,
      },
    ],
  });
});

describe('Mastra XAUUSD social sentiment adapter', () => {
  it('preserves available sentiment and marks social data as untrusted', async () => {
    const execute = xauusdSocialSentimentTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD' }, context);

    expect(mocks.getAggregatedSentiment).toHaveBeenCalledWith('XAUUSD', undefined);
    expect(output).toMatchObject({
      symbol: 'XAUUSD',
      source: 'kestrel-social-sentiment-service',
      freshness: 'fresh',
      quality: 'complete',
      contentTrust: 'untrusted',
      data: {
        overall: 'bullish',
        overallScore: 0.7,
        available: true,
        sources: [{ sampleSize: 100, available: true }],
      },
    });
    expect(output).toMatchObject({
      warnings: expect.arrayContaining([expect.stringContaining('untrusted external data')]),
    });
  });

  it('preserves unavailable fallback semantics without treating neutral as evidence', async () => {
    mocks.getAggregatedSentiment.mockResolvedValueOnce({
      symbol: 'XAUUSD',
      overall: 'neutral',
      overallScore: 0,
      contrarianSignal: false,
      contrarianNote: null,
      fetchedAt: 1_700_000_000_000,
      sources: [
        {
          source: 'retail_positioning',
          sentiment: 'neutral',
          score: 0,
          retailLongPct: null,
          sampleSize: 0,
          available: false,
        },
      ],
    });
    const execute = xauusdSocialSentimentTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD' }, context);

    expect(output).toMatchObject({
      freshness: 'unknown',
      quality: 'degraded',
      contentTrust: 'untrusted',
      data: { overall: 'neutral', overallScore: 0, available: false },
      warnings: expect.arrayContaining([expect.stringContaining('fallback')]),
    });
  });

  it('rejects unsupported symbols at the Mastra schema boundary', () => {
    expect(XauusdSocialSentimentInputSchema.safeParse({ symbol: 'EURUSD' }).success).toBe(false);
    expect(XauusdSocialSentimentInputSchema.safeParse({ symbol: 'XAUUSD' }).success).toBe(true);
  });

  it('forwards abort signals and preserves cancellation failures', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    mocks.getAggregatedSentiment.mockRejectedValueOnce(error);
    const signal = new AbortController().signal;
    const execute = xauusdSocialSentimentTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;

    await expect(execute({ symbol: 'XAUUSD' }, { ...context, abortSignal: signal })).rejects.toBe(
      error,
    );
    expect(mocks.getAggregatedSentiment).toHaveBeenCalledWith('XAUUSD', signal);
  });
});
