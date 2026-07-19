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

import { getPriceTool } from '../src/tools/get-price';

const exec = getPriceTool.execute as unknown as (
  input: { symbols: string[] },
) => Promise<{ ticks: unknown[]; asOf: string }>;

const mockGetPrice = vi.fn();

vi.mock('@hamafx/data', () => ({
  getPrice: (...args: unknown[]) => mockGetPrice(...args),
  ProviderError: class ProviderError extends Error {
    constructor(_code: string, _provider: string, message: string) {
      super(message);
    }
  },
}));

describe('get_price — Phase 0.10', () => {
  beforeEach(() => {
    mockGetPrice.mockReset();
  });

  it('returns ticks for a single symbol', async () => {
    mockGetPrice.mockResolvedValue({
      bid: 1.08,
      ask: 1.0802,
      mid: 1.0801,
      timestamp: Date.now(),
    });

    const result = await exec({ symbols: ['EURUSD'] });

    expect(result.ticks).toHaveLength(1);
    expect((result.ticks[0] as { bid: number; mid: number }).bid).toBe(1.08);
    expect((result.ticks[0] as { bid: number; mid: number }).mid).toBe(1.0801);
  });

  it('returns ticks for multiple symbols', async () => {
    mockGetPrice
      .mockResolvedValueOnce({ bid: 1.08, ask: 1.0802, mid: 1.0801, timestamp: Date.now() })
      .mockResolvedValueOnce({ bid: 2395, ask: 2395.1, mid: 2395.05, timestamp: Date.now() });

    const result = await exec({ symbols: ['EURUSD', 'XAUUSD'] });

    expect(result.ticks).toHaveLength(2);
    expect(mockGetPrice).toHaveBeenCalledTimes(2);
    expect(mockGetPrice).toHaveBeenCalledWith('EURUSD');
    expect(mockGetPrice).toHaveBeenCalledWith('XAUUSD');
  });

  it('wraps ProviderError in a user-friendly message', async () => {
    const { ProviderError } = await import('@hamafx/data');
    mockGetPrice.mockRejectedValue(new ProviderError('PROVIDER_TIMEOUT', 'biquote', 'connection refused'));

    await expect(exec({ symbols: ['EURUSD'] })).rejects.toThrow(
      "Couldn't price EURUSD: connection refused",
    );
  });

  it('re-throws non-ProviderError exceptions', async () => {
    mockGetPrice.mockRejectedValue(new TypeError('unexpected type'));

    await expect(exec({ symbols: ['EURUSD'] })).rejects.toThrow(TypeError);
  });

  it('returns an ISO timestamp asOf the price fetch', async () => {
    const before = new Date().toISOString();
    mockGetPrice.mockResolvedValue({
      bid: 1.08, ask: 1.0802, mid: 1.0801, timestamp: Date.now(),
    });

    const result = await exec({ symbols: ['EURUSD'] });

    expect(result.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Must be at or after the captured "before" moment.
    expect(result.asOf >= before).toBe(true);
  });

  it('validates input schema — min 1 symbol', () => {
    const schema = getPriceTool.inputSchema as { safeParse: (v: unknown) => { success: boolean; error?: { issues?: unknown[] } } };
    expect(schema.safeParse({ symbols: [] }).success).toBe(false);
  });

  it('validates input schema — max 3 symbols', () => {
    const schema = getPriceTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(
      schema.safeParse({ symbols: ['EURUSD', 'GBPUSD', 'XAUUSD'] }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ symbols: ['EURUSD', 'GBPUSD', 'XAUUSD', 'AUDUSD'] }).success,
    ).toBe(false);
  });

  it('rejects unknown symbols', () => {
    const schema = getPriceTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbols: ['BTCUSD'] }).success).toBe(false);
    expect(schema.safeParse({ symbols: ['INVALID'] }).success).toBe(false);
  });

  it('calls getPrice for each symbol in parallel', async () => {
    let resolveSecond: (v: unknown) => void;
    const secondPromise = new Promise<unknown>((resolve) => { resolveSecond = resolve; });
    mockGetPrice
      .mockResolvedValueOnce({ bid: 1.08, ask: 1.0802, mid: 1.0801, timestamp: Date.now() })
      .mockReturnValueOnce(secondPromise);

    // Fire the call but don't await yet—it should start both concurrently.
    const resultPromise = exec({ symbols: ['EURUSD', 'GBPUSD'] });

    // Resolve the delayed second call.
    resolveSecond!({ bid: 1.27, ask: 1.2702, mid: 1.2701, timestamp: Date.now() });

    const result = await resultPromise;
    expect(result.ticks).toHaveLength(2);
  });
});
