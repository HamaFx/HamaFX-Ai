import { beforeEach, describe, expect, it, vi } from 'vitest';

import { XauusdFundamentalContextInputSchema } from '../src/mastra/fundamental-context-tool';
import { xauusdFundamentalContextTool } from '../src/mastra/tools';

const mocks = vi.hoisted(() => ({
  fetchXauusdMacroData: vi.fn(),
  assembleXauusdMacroEvidence: vi.fn(),
  getAggregatedSentiment: vi.fn(),
}));

vi.mock('../src/mastra/research-packet-macro', () => ({
  fetchXauusdMacroData: mocks.fetchXauusdMacroData,
  assembleXauusdMacroEvidence: mocks.assembleXauusdMacroEvidence,
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

const macroEvidence = {
  evidenceId: 'macro-1',
  kind: 'macro' as const,
  symbol: 'XAUUSD' as const,
  source: 'finnhub/marketaux/fred',
  fetchedAt: '2026-08-19T12:00:00.000Z',
  dataAsOf: '2026-08-19T11:00:00.000Z',
  freshness: 'fresh' as const,
  quality: 'complete' as const,
  warnings: [],
  data: {
    news: [
      {
        id: 'news-1',
        title: 'Gold market update',
        summary: 'Untrusted article summary.',
        url: 'https://example.com/news-1',
        source: 'fixture-news',
        publisher: 'Fixture Publisher',
        publishedAt: 1_755_582_000_000,
        symbols: ['XAUUSD'],
        sentiment: 'neutral' as const,
        sentimentScore: 0,
        topics: [],
      },
    ],
    events: [
      {
        id: 'event-1',
        title: 'CPI',
        country: 'US',
        currency: 'USD' as const,
        importance: 'high' as const,
        date: 1_755_600_000_000,
        actual: null,
        forecast: 3,
        previous: 3.1,
        unit: '%',
        source: 'fixture-calendar',
      },
    ],
    dollarIndex: [{ date: '2026-08-19', value: 101 }],
    realYields: [{ date: '2026-08-19', value: 1.7 }],
    breakevenInflation: [{ date: '2026-08-19', value: 2.2 }],
  },
};

const availableSocial = {
  symbol: 'XAUUSD',
  overall: 'bullish' as const,
  overallScore: 0.5,
  contrarianSignal: false,
  contrarianNote: null,
  fetchedAt: Date.now(),
  sources: [
    {
      source: 'retail_positioning' as const,
      sentiment: 'bullish' as const,
      score: 0.5,
      retailLongPct: 45,
      sampleSize: 100,
      available: true,
    },
  ],
};

const unavailableSocial = {
  symbol: 'XAUUSD',
  overall: 'neutral' as const,
  overallScore: 0,
  contrarianSignal: false,
  contrarianNote: null,
  fetchedAt: Date.now(),
  sources: [
    {
      source: 'retail_positioning' as const,
      sentiment: 'neutral' as const,
      score: 0,
      retailLongPct: null,
      sampleSize: 0,
      available: false,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchXauusdMacroData.mockResolvedValue({});
  mocks.assembleXauusdMacroEvidence.mockReturnValue({
    evidence: macroEvidence,
    missingData: [],
    warnings: [],
  });
  mocks.getAggregatedSentiment.mockResolvedValue(availableSocial);
});

describe('Mastra XAUUSD fundamental context', () => {
  it('combines macro and social evidence with a mixed untrusted boundary', async () => {
    const execute = xauusdFundamentalContextTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD' }, context);

    expect(mocks.fetchXauusdMacroData).toHaveBeenCalledWith(undefined);
    expect(mocks.getAggregatedSentiment).toHaveBeenCalledWith('XAUUSD', undefined);
    expect(output).toMatchObject({
      symbol: 'XAUUSD',
      source: 'finnhub/marketaux/fred/social-sentiment',
      quality: 'complete',
      freshness: 'fresh',
      contentTrust: 'mixed-untrusted',
      data: {
        macro: { evidenceId: 'macro-1' },
        social: { available: true, overall: 'bullish' },
      },
    });
    expect(output).toMatchObject({
      warnings: expect.arrayContaining([expect.stringContaining('untrusted external data')]),
    });
  });

  it('preserves partial provider gaps without blocking available evidence', async () => {
    mocks.assembleXauusdMacroEvidence.mockReturnValueOnce({
      evidence: { ...macroEvidence, quality: 'degraded', warnings: ['Calendar unavailable'] },
      missingData: ['The economic calendar is unavailable.'],
      warnings: ['Macro context is partial.'],
    });
    const execute = xauusdFundamentalContextTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD' }, context);

    expect(output).toMatchObject({
      quality: 'partial',
      data: { macro: { quality: 'degraded' }, social: { available: true } },
      missingData: expect.arrayContaining([expect.stringContaining('calendar')]),
    });
  });

  it('fails closed to degraded context when all macro and social evidence is unavailable', async () => {
    mocks.assembleXauusdMacroEvidence.mockReturnValueOnce({
      evidence: null,
      missingData: ['No macro evidence was returned.'],
      warnings: [],
    });
    mocks.getAggregatedSentiment.mockResolvedValueOnce(unavailableSocial);
    const execute = xauusdFundamentalContextTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD' }, context);

    expect(output).toMatchObject({
      quality: 'degraded',
      freshness: 'unknown',
      data: { macro: null, social: { available: false, overall: 'neutral' } },
      missingData: expect.arrayContaining([
        expect.stringContaining('macro'),
        expect.stringContaining('Social'),
      ]),
    });
  });

  it('rejects unsupported symbols at the input boundary', () => {
    expect(XauusdFundamentalContextInputSchema.safeParse({ symbol: 'EURUSD' }).success).toBe(false);
    expect(XauusdFundamentalContextInputSchema.safeParse({ symbol: 'XAUUSD' }).success).toBe(true);
  });

  it('forwards abort signals and preserves cancellation', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    mocks.fetchXauusdMacroData.mockRejectedValueOnce(error);
    const signal = new AbortController().signal;
    const execute = xauusdFundamentalContextTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;

    await expect(execute({ symbol: 'XAUUSD' }, { ...context, abortSignal: signal })).rejects.toBe(
      error,
    );
    expect(mocks.fetchXauusdMacroData).toHaveBeenCalledWith(signal);
    expect(mocks.getAggregatedSentiment).toHaveBeenCalledWith('XAUUSD', signal);
  });
});
