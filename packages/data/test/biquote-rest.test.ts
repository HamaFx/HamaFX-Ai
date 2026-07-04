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

// BiQuote REST client tests. Direct `fetch` stubbing (same pattern as
// `price-adapter.test.ts`) — no MSW. Tests cover happy paths, error
// envelope handling, throttle / 429 backoff, and the bar-ordering invariant.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetThrottle } from '../src/cache/throttle';
import { fetchLatest, fetchOhlc, fetchTick } from '../src/providers/biquote/rest';
import { ProviderError } from '../src/errors';

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_TICK = {
  symbol: 'XAUUSD',
  bid: 2390.12,
  ask: 2390.32,
  mid: 2390.22,
  last: 0,
  volume: 0,
  timestamp: '2026-05-27T18:35:01Z',
  source: 'MetaTrader 5 (Broker 1)',
  description: 'Gold vs US Dollar',
  time: '2026.05.27 18:35:01',
  high: 2392,
  low: 2388,
  direction: 'FLAT',
  dayDiffPercent: 0.4,
  spread: 0.2,
};

function bar(openTime: string, opts: Partial<{ isOpen: boolean }> = {}): unknown {
  return {
    openTime,
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 0,
    tickVolume: 10,
    isOpen: opts.isOpen ?? false,
  };
}

/** Wrap an array of bars in BiQuote's current envelope: `{ symbol, interval, bars }`. */
function ohlcEnvelope(bars: unknown[], symbol = 'XAUUSD', interval = '1m'): unknown {
  return { symbol, interval, bars };
}

describe('biquote fetchTick', () => {
  beforeEach(() => {
    _resetThrottle();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('returns a parsed BiquoteTick for a happy 200 response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(VALID_TICK));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const tick = await fetchTick('XAUUSD');
    expect(tick.symbol).toBe('XAUUSD');
    expect(tick.bid).toBeCloseTo(2390.12);
    expect(tick.source).toBe('MetaTrader 5 (Broker 1)');

    // Verify URL shape: /api/XAUUSD against the default base.
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe('https://biquote.io/api/XAUUSD');
  });

  it('honors BIQUOTE_BASE_URL via the baseUrl option', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(VALID_TICK));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchTick('XAUUSD', { baseUrl: 'https://biquote.example' });
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe('https://biquote.example/api/XAUUSD');
  });

  it('refuses to issue a request for an unsupported symbol (no fetch call)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchTick('GARAN' as unknown as 'XAUUSD')).rejects.toThrow(/unsupported symbol/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces BiQuote's `{ message }` error envelope on 404", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ message: "No tick data available for 'XAUUSD'" }, 404),
      ) as unknown as typeof fetch;

    await expect(fetchTick('XAUUSD')).rejects.toMatchObject({
      provider: 'biquote',
      code: 'PROVIDER_HTTP_ERROR',
      status: 404,
      message: "No tick data available for 'XAUUSD'",
    });
  });

  it('classifies 429 as PROVIDER_QUOTA_EXCEEDED', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'rate limited' }, 429)) as unknown as typeof fetch;

    await expect(fetchTick('XAUUSD')).rejects.toMatchObject({
      code: 'PROVIDER_QUOTA_EXCEEDED',
      status: 429,
    });
  });

  it('throws PROVIDER_PARSE_ERROR on schema mismatch', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unexpected: 'shape' })) as unknown as typeof fetch;

    await expect(fetchTick('XAUUSD')).rejects.toMatchObject({
      code: 'PROVIDER_PARSE_ERROR',
    });
  });
});

describe('biquote fetchLatest', () => {
  beforeEach(() => _resetThrottle());
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('returns an empty array for an empty input without hitting fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const out = await fetchLatest([]);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('joins symbols with commas and parses the array body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse([
        VALID_TICK,
        { ...VALID_TICK, symbol: 'EURUSD', last: 1.085 },
      ]),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ticks = await fetchLatest(['XAUUSD', 'EURUSD']);
    expect(ticks).toHaveLength(2);
    expect(ticks[1]?.symbol).toBe('EURUSD');

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    // Note: URLSearchParams percent-encodes commas as %2C.
    expect(url).toContain('symbols=XAUUSD%2CEURUSD');
  });
});

describe('biquote fetchOhlc', () => {
  beforeEach(() => _resetThrottle());
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('drops the live unfinished bar by default', async () => {
    // Note: BiQuote returns bars NEWEST-first (descending). Tests
    // mirror that and assert the adapter ascends + filters correctly.
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        ohlcEnvelope([
          bar('2026-05-27T18:02:00Z', { isOpen: true }),
          bar('2026-05-27T18:01:00Z'),
          bar('2026-05-27T18:00:00Z'),
        ]),
      ),
    ) as unknown as typeof fetch;

    const out = await fetchOhlc({ symbol: 'XAUUSD', tf: '1m', count: 100 });
    expect(out).toHaveLength(2);
    expect(out.every((b) => !b.isOpen)).toBe(true);
    // Returned ascending.
    expect(out[0]?.openTime).toBe('2026-05-27T18:00:00Z');
    expect(out[1]?.openTime).toBe('2026-05-27T18:01:00Z');
  });

  it('keeps the live bar when includeOpenBar=true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(
        ohlcEnvelope([
          bar('2026-05-27T18:01:00Z', { isOpen: true }),
          bar('2026-05-27T18:00:00Z'),
        ]),
      ),
    ) as unknown as typeof fetch;

    const out = await fetchOhlc({
      symbol: 'XAUUSD',
      tf: '1m',
      count: 100,
      includeOpenBar: true,
    });
    expect(out).toHaveLength(2);
    expect(out[1]?.isOpen).toBe(true);
  });

  it('refuses 1w because BiQuote does not provide weekly bars', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      fetchOhlc({ symbol: 'XAUUSD', tf: '1w', count: 100 }),
    ).rejects.toThrow(/biquote does not provide weekly/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on empty candle response (lets failover try the next provider)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(ohlcEnvelope([])),
    ) as unknown as typeof fetch;

    await expect(
      fetchOhlc({ symbol: 'XAUUSD', tf: '1m', count: 100 }),
    ).rejects.toMatchObject({ code: 'PROVIDER_HTTP_ERROR' });
  });

  it('caps `count` at 1000 to match the documented BiQuote limit', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(jsonResponse(ohlcEnvelope([bar('2026-05-27T18:00:00Z')])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchOhlc({ symbol: 'XAUUSD', tf: '1m', count: 99999 });
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('limit=1000');
  });
});

describe('biquote throttle', () => {
  beforeEach(() => _resetThrottle());
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('throws PROVIDER_QUOTA_EXCEEDED after the 51st call within the window', async () => {
    // A `Response` body can only be consumed once, so each fetch call must
    // get a fresh Response. Use mockImplementation, not mockResolvedValue.
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(VALID_TICK))) as unknown as typeof fetch;

    // 50 calls succeed; the 51st must throw without hitting fetch.
    for (let i = 0; i < 50; i += 1) {
      await fetchTick('XAUUSD');
    }
    await expect(fetchTick('XAUUSD')).rejects.toBeInstanceOf(ProviderError);
  });
});
