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

import { verifyCallTool } from '../src/tools/verify-call';

const exec = verifyCallTool.execute as unknown as (input: {
  symbol: string;
  side: 'long' | 'short';
  entry: number;
  stop: number;
  target?: number | null;
  tf?: string;
  lookbackBars?: number;
}) => Promise<{
  symbol: string;
  side: 'long' | 'short';
  entry: number;
  stop: number;
  target: number | null;
  agree: boolean;
  caveats: Array<{ code: string; message: string }>;
  nearestOpposingLiquidity: {
    price: number;
    kind: 'swing_high' | 'swing_low';
    barsAgo: number;
  } | null;
  marketPrice: number | null;
  marketTolerance: number | null;
  rationale: string;
}>;

const mockGetCandles = vi.fn();
const mockGetPrice = vi.fn();
const mockComputeStructure = vi.fn();

vi.mock('@hamafx/data', () => ({
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
  getPrice: (...args: unknown[]) => mockGetPrice(...args),
}));

vi.mock('@hamafx/indicators', () => ({
  computeStructure: (...args: unknown[]) => mockComputeStructure(...args),
}));

function makeCandle(overrides: { time?: number; open?: number; high?: number; low?: number; close?: number }) {
  return {
    t: overrides.time ?? Date.now(),
    o: overrides.open ?? 1.08,
    h: overrides.high ?? 1.09,
    l: overrides.low ?? 1.07,
    c: overrides.close ?? 1.085,
    symbol: 'EURUSD',
    tf: '1h',
    v: null,
    source: 'test',
    fetchedAt: Date.now(),
  };
}

describe('verify_call — Phase 0.9', () => {
  beforeEach(() => {
    mockGetCandles.mockReset();
    mockGetPrice.mockReset();
    mockComputeStructure.mockReset();
    mockGetPrice.mockResolvedValue({
      symbol: 'EURUSD',
      bid: 1.0799,
      ask: 1.0801,
      mid: 1.08,
      ts: Date.now(),
      source: 'test',
    });
  });

  it('agrees with a clean long setup and no opposing liquidity', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({ symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [] });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'thin_structure')).toBe(true);
    expect(result.nearestOpposingLiquidity).toBeNull();
    expect(result.rationale).toMatch(/caveat/);
  });

  it('flags invalid stop for a long', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({ symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [] });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.085, target: 1.09 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'invalid_stop_side')).toBe(true);
  });

  it('flags invalid stop for a short', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({ symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [] });

    const result = await exec({ symbol: 'EURUSD', side: 'short', entry: 1.08, stop: 1.075, target: 1.07 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'invalid_stop_side')).toBe(true);
  });

  it('flags invalid target for a long', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({ symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [] });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.075 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'invalid_target_side')).toBe(true);
  });

  it('flags invalid target for a short', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({ symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [] });

    const result = await exec({ symbol: 'EURUSD', side: 'short', entry: 1.08, stop: 1.085, target: 1.085 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'invalid_target_side')).toBe(true);
  });

  it('warns when no target is supplied', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({ symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [] });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'no_invalidation')).toBe(true);
  });

  it('flags opposing liquidity inside the path for a long', async () => {
    mockGetCandles.mockResolvedValue([
      makeCandle({ high: 1.088, low: 1.07 }),
      makeCandle({ high: 1.089, low: 1.071 }),
    ]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 2, fetchedAt: Date.now(),
      swings: [
        { type: 'high', price: 1.088, index: 1 },
        { type: 'high', price: 1.086, index: 0 },
      ],
    });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'opposing_liquidity_in_path')).toBe(true);
    expect(result.nearestOpposingLiquidity).toEqual({
      price: 1.086,
      kind: 'swing_high',
      barsAgo: 1,
    });
  });

  it('flags opposing liquidity inside the path for a short', async () => {
    mockGetCandles.mockResolvedValue([
      makeCandle({ high: 1.09, low: 1.072 }),
      makeCandle({ high: 1.089, low: 1.074 }),
    ]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 2, fetchedAt: Date.now(),
      swings: [
        { type: 'low', price: 1.072, index: 1 },
        { type: 'low', price: 1.074, index: 0 },
      ],
    });

    const result = await exec({ symbol: 'EURUSD', side: 'short', entry: 1.08, stop: 1.085, target: 1.07 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'opposing_liquidity_in_path')).toBe(true);
    expect(result.nearestOpposingLiquidity).toEqual({
      price: 1.074,
      kind: 'swing_low',
      barsAgo: 1,
    });
  });

  it('does not flag liquidity outside the path for a long', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(),
      swings: [{ type: 'high', price: 1.095, index: 0 }],
    });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 });

    expect(result.agree).toBe(true);
    expect(result.caveats).toHaveLength(0);
    expect(result.nearestOpposingLiquidity?.price).toBe(1.095);
  });

  it('warns on thin structure when no swings are found', async () => {
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({ symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [] });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'thin_structure')).toBe(true);
  });

  it('warns when candle fetch fails', async () => {
    mockGetCandles.mockRejectedValue(new Error('provider down'));

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 });

    expect(result.agree).toBe(false);
    expect(result.caveats.some((c) => c.code === 'thin_structure')).toBe(true);
  });

  it('uses the nearest opposing swing high above entry for a long', async () => {
    mockGetCandles.mockResolvedValue([
      makeCandle({ high: 1.088, low: 1.07 }),
      makeCandle({ high: 1.089, low: 1.071 }),
      makeCandle({ high: 1.087, low: 1.072 }),
    ]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 3, fetchedAt: Date.now(),
      swings: [
        { type: 'high', price: 1.088, index: 0 },
        { type: 'high', price: 1.087, index: 2 },
      ],
    });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 });

    expect(result.nearestOpposingLiquidity).toEqual({
      price: 1.087,
      kind: 'swing_high',
      barsAgo: 0,
    });
  });

  it('uses the nearest opposing swing low below entry for a short', async () => {
    mockGetCandles.mockResolvedValue([
      makeCandle({ high: 1.09, low: 1.072 }),
      makeCandle({ high: 1.089, low: 1.073 }),
      makeCandle({ high: 1.088, low: 1.071 }),
    ]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 3, fetchedAt: Date.now(),
      swings: [
        { type: 'low', price: 1.072, index: 0 },
        { type: 'low', price: 1.071, index: 2 },
      ],
    });

    const result = await exec({ symbol: 'EURUSD', side: 'short', entry: 1.08, stop: 1.085, target: 1.07 });

    expect(result.nearestOpposingLiquidity).toEqual({
      price: 1.071,
      kind: 'swing_low',
      barsAgo: 0,
    });
  });

  it('fails closed when the live price cannot be fetched', async () => {
    mockGetPrice.mockRejectedValue(new Error('price provider down'));
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [{ type: 'high', price: 1.095, index: 0 }],
    });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 });

    expect(result.agree).toBe(false);
    expect(result.marketPrice).toBeNull();
    expect(result.caveats.some((c) => c.code === 'market_price_unavailable')).toBe(true);
  });

  it('flags levels that sit too far from the live market', async () => {
    mockGetPrice.mockResolvedValue({
      symbol: 'EURUSD',
      bid: 1.1199,
      ask: 1.1201,
      mid: 1.12,
      ts: Date.now(),
      source: 'test',
    });
    mockGetCandles.mockResolvedValue([makeCandle({})]);
    mockComputeStructure.mockReturnValue({
      symbol: 'EURUSD', tf: '1h', bars: 1, fetchedAt: Date.now(), swings: [{ type: 'high', price: 1.13, index: 0 }],
    });

    const result = await exec({ symbol: 'EURUSD', side: 'long', entry: 1.085, stop: 1.08, target: 1.095 });

    expect(result.agree).toBe(false);
    expect(result.marketPrice).toBe(1.12);
    expect(result.marketTolerance).toBeGreaterThan(0);
    expect(result.caveats.some((c) => c.code === 'level_far_from_market')).toBe(true);
  });
});
