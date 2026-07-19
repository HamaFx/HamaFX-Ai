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

import { getMarketStructureTool } from '../src/tools/get-market-structure';

const exec = getMarketStructureTool.execute as unknown as (
  input: { symbol: string; tf: string; count?: number; kinds?: string[]; lookback?: number },
) => Promise<{
  symbol: string;
  tf: string;
  bars: number;
  swings?: Array<{ type: string; price: number; index: number }>;
  events?: Array<{ kind: string; direction: string; index: number; level: number }>;
  fvg?: Array<{ mitigated: boolean }>;
  orderBlocks?: Array<{ mitigated: boolean }>;
  liquidity?: unknown[];
  summary: string;
}>;

const mockGetCandles = vi.fn();
const mockComputeStructure = vi.fn();

vi.mock('@hamafx/data', () => ({
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
}));

vi.mock('@hamafx/indicators', () => ({
  computeStructure: (...args: unknown[]) => mockComputeStructure(...args),
}));

function makeCandle(time: number, close: number) {
  return {
    t: time, o: close - 0.001, h: close + 0.005, l: close - 0.005,
    c: close, symbol: 'EURUSD', tf: '1h',
    v: null, source: 'test', fetchedAt: Date.now(),
  };
}

describe('get_market_structure — Phase 0.10', () => {
  beforeEach(() => {
    mockGetCandles.mockReset();
    mockComputeStructure.mockReset();
  });

  it('returns structure data for a symbol and timeframe', async () => {
    mockGetCandles.mockResolvedValue([makeCandle(Date.now(), 1.085)]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(),
      swings: [{ type: 'high', price: 1.09, index: 0 }],
      events: [{ kind: 'bos', direction: 'bullish', index: 0, level: 1.085 }],
      fvg: [], orderBlocks: [], liquidity: [],
    });

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.symbol).toBe('EURUSD');
    expect(result.tf).toBe('1h');
    expect(result.swings).toBeDefined();
    expect(result.swings![0]!.price).toBe(1.09);
    expect(result.summary).toContain('swings');
  });

  it('generates a summary with unmitigated counts', async () => {
    mockGetCandles.mockResolvedValue([makeCandle(Date.now(), 1.085)]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(),
      swings: [{ type: 'high', price: 1.09, index: 0 }],
      events: [{ kind: 'bos', direction: 'bullish', index: 0, level: 1.085 }],
      fvg: [
        { mitigated: false, high: 1.086, low: 1.085, index: 0 },
        { mitigated: true, high: 1.087, low: 1.086, index: 1 },
      ],
      orderBlocks: [],
      liquidity: [],
    });

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.summary).toMatch(/1/);
    expect(result.summary).toMatch(/unmitigated/i);
  });

  it('calls getCandles with correct parameters', async () => {
    mockGetCandles.mockResolvedValue([]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '4h', bars: 0, fetchedAt: Date.now(),
    });

    await exec({ symbol: 'EURUSD', tf: '4h', count: 300 });

    expect(mockGetCandles).toHaveBeenCalledWith('EURUSD', '4h', { count: 300 });
  });

  it('validates input schema — count min 50', () => {
    const schema = getMarketStructureTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 49 }).success).toBe(false);
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 50 }).success).toBe(true);
  });

  it('validates input schema — count max 1000', () => {
    const schema = getMarketStructureTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 1000 }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 1001 }).success).toBe(false);
  });

  it('validates input schema — count defaults to 300', () => {
    const schema = getMarketStructureTool.inputSchema as { safeParse: (v: unknown) => { success: boolean; data?: { count: number } } };
    const parsed = schema.safeParse({ symbol: 'EURUSD', tf: '1h' });
    expect(parsed.success).toBe(true);
    if (parsed.data) expect(parsed.data.count).toBe(300);
  });

  it('validates input schema — lookback range 2 to 10', () => {
    const schema = getMarketStructureTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 1 }).success).toBe(false);
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 2 }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 10 }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', lookback: 11 }).success).toBe(false);
  });

  it('passes kinds and lookback through to computeStructure', async () => {
    mockGetCandles.mockResolvedValue([makeCandle(Date.now(), 1.085)]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(),
    });

    await exec({ symbol: 'EURUSD', tf: '1h', kinds: ['swings', 'fvg'], lookback: 5 });

    expect(mockComputeStructure).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: ['swings', 'fvg'],
        swings: { lookback: 5 },
      }),
    );
  });
});
