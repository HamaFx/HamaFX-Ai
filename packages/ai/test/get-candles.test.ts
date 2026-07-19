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

import { getCandlesTool } from '../src/tools/get-candles';

const exec = getCandlesTool.execute as unknown as (
  input: { symbol: string; tf: string; count?: number },
) => Promise<{ symbol: string; tf: string; candles: unknown[] }>;

const mockGetCandles = vi.fn();

vi.mock('@hamafx/data', () => ({
  getCandles: (...args: unknown[]) => mockGetCandles(...args),
}));

function makeCandle(overrides: { time?: number; open?: number; high?: number; low?: number; close?: number; tf?: string }) {
  return {
    t: overrides.time ?? Date.now(),
    o: overrides.open ?? 1.08,
    h: overrides.high ?? 1.09,
    l: overrides.low ?? 1.07,
    c: overrides.close ?? 1.085,
    symbol: 'EURUSD',
    tf: overrides.tf ?? '1h',
    v: null,
    source: 'test',
    fetchedAt: Date.now(),
  };
}

describe('get_candles — Phase 0.10', () => {
  beforeEach(() => {
    mockGetCandles.mockReset();
  });

  it('returns candles for a symbol and timeframe', async () => {
    const candles = [makeCandle({}), makeCandle({ time: Date.now() - 3600_000 })];
    mockGetCandles.mockResolvedValue(candles);

    const result = await exec({ symbol: 'EURUSD', tf: '1h' });

    expect(result.symbol).toBe('EURUSD');
    expect(result.tf).toBe('1h');
    expect(result.candles).toEqual(candles);
  });

  it('passes count through to getCandles (defaults applied by AI SDK wrapper, not execute itself)', async () => {
    mockGetCandles.mockResolvedValue([]);

    // When calling execute() directly (bypassing the AI SDK tool wrapper),
    // the Zod .default(120) is not applied — that's the SDK's job.
    // The execute function just passes through whatever it receives.
    await exec({ symbol: 'EURUSD', tf: '1h', count: 120 });

    expect(mockGetCandles).toHaveBeenCalledWith('EURUSD', '1h', { count: 120 });
  });

  it('passes a custom count when provided', async () => {
    mockGetCandles.mockResolvedValue([]);

    await exec({ symbol: 'EURUSD', tf: '15m', count: 50 });

    expect(mockGetCandles).toHaveBeenCalledWith('EURUSD', '15m', { count: 50 });
  });

  it('returns XAUUSD candles with correct symbol', async () => {
    const candles = [makeCandle({ time: Date.now(), open: 2400, high: 2405, low: 2395, close: 2402 })];
    mockGetCandles.mockResolvedValue(candles);

    const result = await exec({ symbol: 'XAUUSD', tf: '4h' });

    expect(result.symbol).toBe('XAUUSD');
    expect(result.tf).toBe('4h');
    expect(result.candles).toHaveLength(1);
  });

  it('returns GBPUSD candles', async () => {
    const candles = [makeCandle({ time: Date.now(), open: 1.27, high: 1.275, low: 1.265, close: 1.272 })];
    mockGetCandles.mockResolvedValue(candles);

    const result = await exec({ symbol: 'GBPUSD', tf: '1d' });

    expect(result.symbol).toBe('GBPUSD');
    expect(result.candles).toHaveLength(1);
  });

  it('validates input schema — count min 10', () => {
    const schema = getCandlesTool.inputSchema as { safeParse: (v: unknown) => { success: boolean; error?: { issues?: unknown[] } } };
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 5 }).success).toBe(false);
  });

  it('validates input schema — count max 500', () => {
    const schema = getCandlesTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 500 }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '1h', count: 501 }).success).toBe(false);
  });

  it('validates input schema — count defaults to 120', () => {
    const schema = getCandlesTool.inputSchema as { safeParse: (v: unknown) => { success: boolean; data?: { count: number } } };
    const parsed = schema.safeParse({ symbol: 'EURUSD', tf: '1h' });
    expect(parsed.success).toBe(true);
    if (parsed.data) {
      expect(parsed.data.count).toBe(120);
    }
  });

  it('validates input schema — unknown symbol rejected', () => {
    const schema = getCandlesTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'UNKNOWN', tf: '1h' }).success).toBe(false);
  });

  it('validates input schema — unknown timeframe rejected', () => {
    const schema = getCandlesTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', tf: '7h' }).success).toBe(false);
  });

  it('accepts all standard timeframes', () => {
    const schema = getCandlesTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    // TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']) {
      expect(schema.safeParse({ symbol: 'EURUSD', tf }).success).toBe(true);
    }
  });
});
