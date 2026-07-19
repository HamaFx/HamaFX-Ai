/**
 * Copyright 2026 HamaFX
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analyzeTechnicalTool } from '../src/tools/analyze-technical';

const exec = analyzeTechnicalTool.execute as unknown as (
  input: { symbol: string; timeframes?: string[] },
) => Promise<{
  symbol: string;
  asOf: number;
  perTimeframe: Array<{
    tf: string;
    trend: 'up' | 'down' | 'range';
    bias: 'bullish' | 'bearish' | 'neutral';
    momentum: { rsi14: number; macdHist: number };
    structure: {
      swingHigh: number | null;
      swingLow: number | null;
      latestStructureEvent: 'BOS_up' | 'BOS_down' | 'CHoCH_up' | 'CHoCH_down' | null;
    };
    levels: { pivot: number | null; r1: number | null; s1: number | null; atr14: number | null };
  }>;
  summary: string;
  partial: boolean;
}>;

const mockGetCandles = vi.fn();
const mockComputeIndicator = vi.fn();
const mockComputeStructure = vi.fn();

vi.mock('@hamafx/data', () => ({
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
}));

vi.mock('@hamafx/indicators', () => ({
  computeIndicator: (...args: unknown[]) => mockComputeIndicator(...args),
  computeStructure: (...args: unknown[]) => mockComputeStructure(...args),
}));

vi.mock('@hamafx/shared/logger', () => ({
  createCategorizedLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function fakeIndicatorResult(values: number[] | Array<Record<string, number | null>>) {
  return { symbol: 'EURUSD', tf: '1h', kind: 'test', params: {}, values };
}

function makeCandle(time: number, close: number, high = close + 0.005, low = close - 0.005) {
  return {
    t: time,
    o: close - 0.001,
    h: high,
    l: low,
    c: close,
    symbol: 'EURUSD',
    tf: '1h',
    v: null,
    source: 'test',
    fetchedAt: Date.now(),
  };
}

describe('analyze_technical — Phase 0.10', () => {
  beforeEach(() => {
    mockGetCandles.mockReset();
    mockComputeIndicator.mockReset();
    mockComputeStructure.mockReset();
  });

  function setupCleanMocks(closePrice = 1.082) {
    const candles = [
      makeCandle(Date.now() - 3600_000 * 199, closePrice - 0.003),
      makeCandle(Date.now(), closePrice),
    ];
    mockGetCandles.mockResolvedValue(candles);

    // EMA50 slightly below close → bullish, EMA200 below EMA50 → trend up
    mockComputeIndicator
      .mockReturnValueOnce(fakeIndicatorResult([closePrice - 0.001])) // ema50
      .mockReturnValueOnce(fakeIndicatorResult([closePrice - 0.002])) // ema200
      .mockReturnValueOnce(fakeIndicatorResult([55]))                   // rsi14
      .mockReturnValueOnce(fakeIndicatorResult([{ hist: 0.0001 }]))    // macd
      .mockReturnValueOnce(fakeIndicatorResult([0.001]))               // atr14
      .mockReturnValueOnce(fakeIndicatorResult([{ pp: 1.08, r1: 1.09, s1: 1.07 }])); // pivots

    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD',
      tf: '1h',
      bars: 200,
      fetchedAt: Date.now(),
      swings: [
        { type: 'high', price: 1.09, index: 50 },
        { type: 'low', price: 1.07, index: 100 },
      ],
      events: [{ kind: 'bos', direction: 'bullish', index: 10 }],
      fvgs: [],
      orderBlocks: [],
    });
  }

  it('returns perTimeframe readings for a single default timeframe', async () => {
    setupCleanMocks();

    const result = await exec({ symbol: 'EURUSD', timeframes: ['1h'] });

    expect(result.symbol).toBe('EURUSD');
    expect(result.perTimeframe).toHaveLength(1);
    expect(result.partial).toBe(false);

    const r = result.perTimeframe[0];
    expect(r).toBeDefined();
    if (!r) return;
    expect(r.tf).toBe('1h');
    expect(r.trend).toBe('up');
    expect(r.bias).toBe('bullish');
    expect(r.momentum.rsi14).toBe(55);
    expect(r.momentum.macdHist).toBe(0.0001);
    expect(r.structure.swingHigh).toBe(1.09);
    expect(r.structure.swingLow).toBe(1.07);
    expect(r.structure.latestStructureEvent).toBe('BOS_up');
  });

  it('returns trend: range when EMAs cross', async () => {
    const candles = [makeCandle(Date.now() - 100, 1.082), makeCandle(Date.now(), 1.082)];
    mockGetCandles.mockResolvedValue(candles);
    // EMA50 above EMA200 but close below EMA50 → range
    mockComputeIndicator
      .mockReturnValueOnce(fakeIndicatorResult([1.085]))  // ema50 — above close
      .mockReturnValueOnce(fakeIndicatorResult([1.083]))  // ema200 — below ema50
      .mockReturnValueOnce(fakeIndicatorResult([50]))      // rsi14
      .mockReturnValueOnce(fakeIndicatorResult([{ hist: 0 }]))
      .mockReturnValueOnce(fakeIndicatorResult([0.001]))
      .mockReturnValueOnce(fakeIndicatorResult([{ pp: 1.08, r1: null, s1: null }]));
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 2, fetchedAt: Date.now(),
      swings: [], events: [], fvgs: [], orderBlocks: [],
    });

    const result = await exec({ symbol: 'EURUSD', timeframes: ['1h'] });
    const r = result.perTimeframe[0]!;
    expect(r.trend).toBe('range');
  });

  it('sets partial: true when a timeframe fetch fails', async () => {
    setupCleanMocks();

    // Override for 4h to fail
    mockGetCandles
      .mockResolvedValueOnce([
        makeCandle(Date.now() - 3600_000 * 199, 1.079),
        makeCandle(Date.now(), 1.082),
      ]) // 1h succeeds
      .mockRejectedValueOnce(new Error('provider down')); // 4h fails

    mockComputeIndicator
      .mockReturnValueOnce(fakeIndicatorResult([1.081]))
      .mockReturnValueOnce(fakeIndicatorResult([1.08]))
      .mockReturnValueOnce(fakeIndicatorResult([55]))
      .mockReturnValueOnce(fakeIndicatorResult([{ hist: 0.0001 }]))
      .mockReturnValueOnce(fakeIndicatorResult([0.001]))
      .mockReturnValueOnce(fakeIndicatorResult([{ pp: 1.08, r1: 1.09, s1: 1.07 }]));
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 200, fetchedAt: Date.now(),
      swings: [], events: [], fvgs: [], orderBlocks: [],
    });

    const result = await exec({ symbol: 'EURUSD', timeframes: ['1h', '4h'] });

    expect(result.partial).toBe(true);
    expect(result.perTimeframe).toHaveLength(1);
  });

  it('returns bias: bearish when trend is down and RSI ≤ 55', async () => {
    const candles = [makeCandle(Date.now() - 100, 1.084), makeCandle(Date.now(), 1.08)];
    mockGetCandles.mockResolvedValue(candles);
    // close=1.08 < ema50=1.082 < ema200=1.084 → trend: down
    mockComputeIndicator
      .mockReturnValueOnce(fakeIndicatorResult([1.082]))   // ema50 — above close
      .mockReturnValueOnce(fakeIndicatorResult([1.084]))   // ema200 — above ema50 → ema50 < ema200
      .mockReturnValueOnce(fakeIndicatorResult([45]))       // rsi14 ≤ 55
      .mockReturnValueOnce(fakeIndicatorResult([{ hist: -0.0001 }]))
      .mockReturnValueOnce(fakeIndicatorResult([0.001]))
      .mockReturnValueOnce(fakeIndicatorResult([{ pp: 1.08, r1: null, s1: null }]));
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 2, fetchedAt: Date.now(),
      swings: [], events: [], fvgs: [], orderBlocks: [],
    });

    const result = await exec({ symbol: 'EURUSD', timeframes: ['1h'] });
    const r = result.perTimeframe[0]!;
    expect(r.trend).toBe('down');
    expect(r.bias).toBe('bearish');
  });

  it('generates a descriptive summary string', async () => {
    setupCleanMocks();

    const result = await exec({ symbol: 'EURUSD', timeframes: ['1h'] });

    expect(result.summary).toMatch(/EURUSD:/);
    expect(result.summary).toMatch(/up\/bullish|range\/neutral|down\/bearish/);
  });

  it('handles empty summary when all timeframes fail', async () => {
    mockGetCandles.mockRejectedValue(new Error('provider down'));

    const result = await exec({ symbol: 'EURUSD', timeframes: ['1h', '4h'] });

    expect(result.perTimeframe).toHaveLength(0);
    expect(result.partial).toBe(true);
    expect(result.summary).toMatch(/no timeframes available|empty/i);
  });

  it('validates input schema — timeframes min 1', () => {
    const schema = analyzeTechnicalTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', timeframes: [] }).success).toBe(false);
  });

  it('validates input schema — timeframes max 5', () => {
    const schema = analyzeTechnicalTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(
      schema.safeParse({ symbol: 'EURUSD', timeframes: ['1m', '5m', '15m', '1h', '4h'] }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ symbol: 'EURUSD', timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'] }).success,
    ).toBe(false);
  });
});
