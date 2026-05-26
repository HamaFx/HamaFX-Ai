// End-to-end test for the price adapter using a mocked global fetch.
// We don't use MSW here to keep the dep footprint tiny — direct fetch
// stubbing is enough for one provider and is faster.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPrice } from '../src/adapters/price';
import { setDefaultCache } from '../src/cache';
import { MemoryCache } from '../src/cache/memory';
import { _resetThrottle } from '../src/cache/throttle';

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOnce(body: unknown, init: { status?: number } = { status: 200 }): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('getPrice', () => {
  beforeEach(() => {
    setDefaultCache(new MemoryCache());
    _resetThrottle();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('returns a normalised Tick from twelve-data', async () => {
    mockFetchOnce({ price: '2345.678' });
    const tick = await getPrice('XAUUSD', { apiKeys: { twelveData: 'X' } });
    expect(tick.symbol).toBe('XAUUSD');
    expect(tick.mid).toBeCloseTo(2345.678);
    expect(tick.bid).toBe(tick.mid);
    expect(tick.ask).toBe(tick.mid);
    expect(tick.source).toBe('twelve-data');
    expect(tick.ts).toBeTypeOf('number');
  });

  it('serves the second call from cache without hitting fetch again', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ price: '1.0850' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await getPrice('EURUSD', { apiKeys: { twelveData: 'X' } });
    await getPrice('EURUSD', { apiKeys: { twelveData: 'X' } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls over to finnhub when twelve-data errors', async () => {
    const fetchSpy = vi
      .fn()
      // Twelve Data error envelope (200 OK but status:error).
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 429, message: 'limit', status: 'error' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      // Finnhub success.
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ c: 1.27, h: 1.28, l: 1.26, o: 1.27, pc: 1.265, t: 1700000000 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const tick = await getPrice('GBPUSD', {
      apiKeys: { twelveData: 'X', finnhub: 'Y' },
    });
    expect(tick.source).toBe('finnhub');
    expect(tick.mid).toBe(1.27);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws when no provider is configured', async () => {
    await expect(getPrice('XAUUSD', { apiKeys: {} })).rejects.toThrow(/no providers/);
  });
});
