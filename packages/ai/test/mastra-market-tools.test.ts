import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  xauusdMarketStructureTool,
  xauusdSessionLevelsTool,
  xauusdTechnicalAnalysisTool,
} from '../src/mastra/tools';

const mocks = vi.hoisted(() => ({
  getCandlesWithMeta: vi.fn(),
  computeMarketStructureOutput: vi.fn(),
  computeSessionLevels: vi.fn(),
  computeTechnicalReading: vi.fn(),
  deterministicSummary: vi.fn(),
}));

vi.mock('@kestrel/data', () => ({
  getCandlesWithMeta: mocks.getCandlesWithMeta,
}));
vi.mock('../src/tools/get-market-structure', () => ({
  computeMarketStructureOutput: mocks.computeMarketStructureOutput,
}));
vi.mock('../src/tools/get-session-levels', () => ({
  computeSessionLevels: mocks.computeSessionLevels,
}));
vi.mock('../src/tools/analyze-technical', () => ({
  computeTechnicalReading: mocks.computeTechnicalReading,
  deterministicSummary: mocks.deterministicSummary,
}));
vi.mock('../src/mastra/telemetry', () => ({
  executeMastraTool: vi.fn((_name: string, _context: unknown, fn: () => Promise<unknown>) => fn()),
}));

const context = {
  requestContext: {
    get: (key: string) => ({ userId: 'user-1', runId: 'run-1', threadId: 'thread-1' })[key],
  },
};

function candleResult(count: number, stale = false) {
  return {
    candles: Array.from({ length: count }, (_, index) => ({
      t: 1_700_000_000_000 + index * 3_600_000,
      o: 2000,
      h: 2010,
      l: 1990,
      c: 2005,
      v: 1,
      source: 'fixture-provider',
      fetchedAt: 1_700_000_000_000,
    })),
    stale,
    producedAt: 1_700_000_100_000,
  };
}

const technicalReading = {
  tf: '1h',
  trend: 'up',
  bias: 'bullish',
  momentum: { rsi14: 60, macdHist: 1 },
  structure: { swingHigh: 2010, swingLow: 1990, latestStructureEvent: null },
  levels: { pivot: 2000, r1: 2020, s1: 1980, atr14: 10 },
};

describe('Mastra migrated market tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCandlesWithMeta.mockImplementation(
      (_symbol: string, _tf: string, options: { count: number }) =>
        Promise.resolve(candleResult(options.count)),
    );
    mocks.computeMarketStructureOutput.mockReturnValue({
      symbol: 'XAUUSD',
      tf: '1h',
      bars: 200,
      swings: [{ index: 1, time: 1_700_000_000_000, price: 2000, type: 'high', lookback: 3 }],
      summary: '1 swing',
    });
    mocks.computeSessionLevels.mockReturnValue({
      symbol: 'XAUUSD',
      asOf: 1_700_000_000_000,
      today: [],
      prior: null,
      pipelinePending: false,
    });
    mocks.computeTechnicalReading.mockImplementation(({ tf }: { tf: string }) => ({
      ...technicalReading,
      tf,
    }));
    mocks.deterministicSummary.mockReturnValue('XAUUSD: technical summary');
  });

  it('preserves provider freshness and provenance for structure', async () => {
    const execute = xauusdMarketStructureTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute(
      { symbol: 'XAUUSD', timeframe: '1h', count: 200, lookback: 3 },
      context,
    );

    expect(mocks.getCandlesWithMeta).toHaveBeenCalledWith('XAUUSD', '1h', { count: 200 });
    expect(output).toMatchObject({
      symbol: 'XAUUSD',
      timeframe: '1h',
      source: 'fixture-provider',
      freshness: 'fresh',
      quality: 'complete',
      data: { bars: 200 },
    });
  });

  it('marks stale session candles as stale and degraded', async () => {
    mocks.getCandlesWithMeta.mockResolvedValueOnce(candleResult(60, true));
    const execute = xauusdSessionLevelsTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD', includePrior: true }, context);

    expect(output).toMatchObject({
      symbol: 'XAUUSD',
      freshness: 'stale',
      quality: 'degraded',
      data: { prior: null, pipelinePending: false },
    });
    expect(output).toMatchObject({
      warnings: ['Candles were served from stale-while-error cache'],
    });
  });

  it('preserves partial technical results and aggregates timeframe metadata', async () => {
    mocks.getCandlesWithMeta
      .mockResolvedValueOnce(candleResult(200))
      .mockRejectedValueOnce(new Error('provider unavailable'));
    const execute = xauusdTechnicalAnalysisTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD', timeframes: ['4h', '1h'] }, context);

    expect(output).toMatchObject({
      symbol: 'XAUUSD',
      source: 'fixture-provider',
      freshness: 'fresh',
      quality: 'degraded',
      data: { partial: true, perTimeframe: [{ ...technicalReading, tf: '4h' }] },
    });
    expect(output).toMatchObject({
      warnings: ['One or more requested timeframes were unavailable'],
    });
  });

  it('forwards Mastra cancellation to the data adapter', async () => {
    const signal = new AbortController().signal;
    const execute = xauusdMarketStructureTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    await execute(
      { symbol: 'XAUUSD', timeframe: '1h', count: 200, lookback: 3 },
      {
        ...context,
        abortSignal: signal,
      },
    );

    expect(mocks.getCandlesWithMeta).toHaveBeenCalledWith('XAUUSD', '1h', { count: 200, signal });
  });
});
