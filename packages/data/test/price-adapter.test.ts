// End-to-end tests for the price adapter using a URL-routed mock fetch.
// The price adapter now tries BiQuote first (Phase 8 PR-4), then Twelve
// Data, then Finnhub — so tests need to be explicit about which provider
// is expected to answer.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPrice, getPriceWithMeta } from '../src/adapters/price';
import { setDefaultCache } from '../src/cache';
import { MemoryCache } from '../src/cache/memory';
import { _resetThrottle } from '../src/cache/throttle';
import { _resetHealth } from '../src/health';

const ORIGINAL_FETCH = globalThis.fetch;

interface MockResponse {
  status?: number;
  body?: unknown;
  raw?: string;
}

interface RouteHandler {
  match: (url: string) => boolean;
  respond: () => MockResponse;
}

/**
 * Build a fetch mock that dispatches to the first matching route, in
 * order. Route handlers may be one-shot (consumed once) or persistent.
 */
function createRoutedFetch(routes: RouteHandler[]): typeof fetch {
  return vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const route of routes) {
      if (route.match(url)) {
        const r = route.respond();
        const body = r.raw !== undefined ? r.raw : JSON.stringify(r.body ?? null);
        return Promise.resolve(
          new Response(body, {
            status: r.status ?? 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
    }
    return Promise.reject(new Error(`unmocked URL: ${url}`));
  }) as unknown as typeof fetch;
}

const VALID_BIQUOTE_TICK = (symbol: string, last: number) => ({
  symbol,
  description: '',
  bid: last,
  ask: last,
  last,
  volume: 0,
  time: '2026-05-27T18:35:01Z',
  source: 'MT5',
  type: 'Forex',
});

beforeEach(() => {
  setDefaultCache(new MemoryCache());
  _resetThrottle();
  _resetHealth();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('getPrice — provider order (Phase 8: biquote first)', () => {
  it('returns a normalised Tick from biquote when available', async () => {
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('XAUUSD', 2345.678) }),
      },
    ]);

    const tick = await getPrice('XAUUSD', { apiKeys: { twelveData: 'X' } });
    expect(tick.source).toBe('biquote');
    expect(tick.mid).toBeCloseTo(2345.678);
    expect(tick.bid).toBe(tick.mid);
    expect(tick.ask).toBe(tick.mid);
  });

  it('serves the second call from cache without hitting fetch again', async () => {
    const fetchSpy = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('EURUSD', 1.085) }),
      },
    ]);
    globalThis.fetch = fetchSpy;

    await getPrice('EURUSD');
    await getPrice('EURUSD');
    // First call hits BiQuote; second is served from cache.
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it('falls over from biquote → twelve-data → finnhub', async () => {
    let biquoteCalls = 0;
    let twelveDataCalls = 0;
    let finnhubCalls = 0;
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => {
          biquoteCalls += 1;
          return { status: 503, body: { message: 'down' } };
        },
      },
      {
        match: (u) => u.includes('twelvedata.com'),
        respond: () => {
          twelveDataCalls += 1;
          // Twelve Data error envelope (200 OK but status:error).
          return { body: { code: 429, message: 'limit', status: 'error' } };
        },
      },
      {
        match: (u) => u.includes('finnhub.io'),
        respond: () => {
          finnhubCalls += 1;
          return {
            body: { c: 1.27, h: 1.28, l: 1.26, o: 1.27, pc: 1.265, t: 1700000000 },
          };
        },
      },
    ]);

    const tick = await getPrice('GBPUSD', {
      apiKeys: { twelveData: 'X', finnhub: 'Y' },
    });
    expect(tick.source).toBe('finnhub');
    expect(tick.mid).toBe(1.27);
    expect(biquoteCalls).toBe(1);
    expect(twelveDataCalls).toBe(1);
    expect(finnhubCalls).toBe(1);
  });

  it('still works when only biquote is configured (no Twelve Data / Finnhub keys)', async () => {
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('XAUUSD', 2400) }),
      },
    ]);
    // No apiKeys provided — only the keyless BiQuote attempt is wired.
    const tick = await getPrice('XAUUSD');
    expect(tick.source).toBe('biquote');
  });
});

describe('getPriceWithMeta — Phase 7a SWR (still works post-PR-4)', () => {
  it('returns stale=false on the fresh fetch and stale=true on a fallback read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));

    // First call: BiQuote succeeds.
    globalThis.fetch = createRoutedFetch([
      {
        match: (u) => u.includes('biquote.io/api/'),
        respond: () => ({ body: VALID_BIQUOTE_TICK('XAUUSD', 2345.6) }),
      },
    ]);

    const fresh = await getPriceWithMeta('XAUUSD');
    expect(fresh.stale).toBe(false);
    expect(fresh.tick.mid).toBeCloseTo(2345.6);

    // Past TTL (3s) but within SWR ceiling (30s).
    vi.advanceTimersByTime(5_000);

    // Now every upstream fails — the adapter must serve the cached tick.
    globalThis.fetch = createRoutedFetch([
      {
        match: () => true, // catch-all
        respond: () => ({ status: 503, raw: 'upstream down' }),
      },
    ]);

    const stale = await getPriceWithMeta('XAUUSD');
    expect(stale.stale).toBe(true);
    expect(stale.tick.mid).toBeCloseTo(2345.6);
  });
});
