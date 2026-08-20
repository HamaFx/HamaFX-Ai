import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  xauusdCorrelationTool,
  xauusdIntermarketTool,
  xauusdVolatilityTool,
} from '../src/mastra/tools';
import { XauusdVolatilityInputSchema } from '../src/mastra/volatility-tool';

const mocks = vi.hoisted(() => ({
  correlationExecute: vi.fn(),
  intermarketExecute: vi.fn(),
  volatilityExecute: vi.fn(),
}));

vi.mock('../src/tools/get-correlation', () => ({
  getCorrelationTool: { execute: mocks.correlationExecute },
}));
vi.mock('../src/tools/get-intermarket', () => ({
  getIntermarketTool: { execute: mocks.intermarketExecute },
}));
vi.mock('../src/tools/forecast-volatility', () => ({
  forecastVolatilityTool: { execute: mocks.volatilityExecute },
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
  mocks.correlationExecute.mockResolvedValue({
    tf: '1h',
    windowBars: 100,
    asOf: 1_700_000_000_000,
    matrix: [],
    dxyProxy: { value: 100, change24h: 0.2, samples: 100, formula: 'proxy formula' },
  });
  mocks.intermarketExecute.mockResolvedValue({
    asOf: 1_700_000_000_000,
    tf: '1h',
    windowBars: 100,
    dxyProxy: { value: 100, change24h: 0.2, formula: 'proxy formula' },
    goldChange24h: -0.3,
    xauDxyCorrelation: -0.7,
    regime: 'risk-off',
    regimeBreak: false,
    notes: 'Dollar bid, gold offered.',
    partial: false,
  });
  mocks.volatilityExecute.mockResolvedValue({
    symbol: 'XAUUSD',
    tf: '1h',
    horizonHours: 24,
    asOf: 1_700_000_000_000,
    atrPips: 100,
    atrPipsBaseline30d: 80,
    expectedMovePips: 500,
    expectedRange: null,
    eventAdjusted: false,
    eventMultiplier: 1,
    nextHighImpact: null,
    notes: 'Expected range unavailable.',
  });
});

describe('Mastra migrated context tools', () => {
  it('wraps correlation with an explicit proxy warning', async () => {
    const execute = xauusdCorrelationTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ tf: '1h', windowBars: 100 }, context);

    expect(mocks.correlationExecute).toHaveBeenCalledWith({ tf: '1h', windowBars: 100 }, {});
    expect(output).toMatchObject({
      symbol: 'XAUUSD',
      freshness: 'unknown',
      quality: 'degraded',
      data: { dxyProxy: { value: 100 } },
    });
    expect(output).toMatchObject({
      warnings: expect.arrayContaining([expect.stringContaining('two-leg proxy')]),
    });
  });

  it('preserves partial intermarket results and abort propagation', async () => {
    mocks.intermarketExecute.mockResolvedValueOnce({
      asOf: 1_700_000_000_000,
      tf: '4h',
      windowBars: 50,
      dxyProxy: { value: 0, change24h: 0, formula: 'proxy formula' },
      goldChange24h: null,
      xauDxyCorrelation: 0,
      regime: 'neutral',
      regimeBreak: false,
      notes: 'Partial.',
      partial: true,
    });
    const signal = new AbortController().signal;
    const execute = xauusdIntermarketTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ tf: '4h', windowBars: 50 }, { ...context, abortSignal: signal });

    expect(mocks.intermarketExecute).toHaveBeenCalledWith(
      { tf: '4h', windowBars: 50 },
      { abortSignal: signal },
    );
    expect(output).toMatchObject({
      quality: 'degraded',
      data: { partial: true },
      warnings: expect.arrayContaining([expect.stringContaining('series')]),
    });
  });

  it('keeps volatility XAUUSD-only and explains missing live range data', async () => {
    const execute = xauusdVolatilityTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;
    const output = await execute({ symbol: 'XAUUSD', tf: '1h', horizonHours: 24 }, context);

    expect(mocks.volatilityExecute).toHaveBeenCalledWith(
      { symbol: 'XAUUSD', tf: '1h', horizonHours: 24 },
      {},
    );
    expect(output).toMatchObject({
      symbol: 'XAUUSD',
      quality: 'degraded',
      data: { expectedRange: null },
      warnings: expect.arrayContaining([expect.stringContaining('Live price')]),
    });
  });

  it('rejects unsupported volatility symbols and preserves abort failures', async () => {
    expect(() =>
      XauusdVolatilityInputSchema.parse({
        symbol: 'EURUSD',
        tf: '1h',
        horizonHours: 24,
      }),
    ).toThrow();

    const error = new DOMException('Aborted', 'AbortError');
    mocks.volatilityExecute.mockRejectedValueOnce(error);
    const signal = new AbortController().signal;
    const execute = xauusdVolatilityTool.execute as unknown as (
      input: unknown,
      ctx: unknown,
    ) => Promise<unknown>;

    await expect(
      execute(
        { symbol: 'XAUUSD', tf: '1h', horizonHours: 24 },
        { ...context, abortSignal: signal },
      ),
    ).rejects.toBe(error);
    expect(mocks.volatilityExecute).toHaveBeenCalledWith(
      { symbol: 'XAUUSD', tf: '1h', horizonHours: 24 },
      { abortSignal: signal },
    );
  });
});
