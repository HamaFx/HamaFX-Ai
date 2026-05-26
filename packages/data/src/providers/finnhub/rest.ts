// Finnhub REST client — fallback path for FX prices/candles.
//
// Phase 1a: price endpoint only.
// Phase 2: candles via /forex/candle. The free FX endpoint doesn't natively
// expose 4h, so we request 1h and synthesise 4h client-side (4-bar
// aggregation: first open, last close, max high, min low, summed volume).

import type { Symbol, Timeframe } from '@hamafx/shared';
import { z } from 'zod';

import { tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { toFinnhubResolution, toFinnhubSymbol } from './map';

const PROVIDER = 'finnhub';
const BASE_URL = 'https://finnhub.io/api/v1';
const DEFAULT_TIMEOUT_MS = 8_000;

// Free tier is 60 req/min. Cap ourselves at 30 to leave room.
const THROTTLE: ThrottleConfig = { limit: 30, windowMs: 60_000 };

const FhQuoteSchema = z.object({
  c: z.number(), // current
  h: z.number(),
  l: z.number(),
  o: z.number(),
  pc: z.number(), // previous close
  t: z.number(), // ts seconds
});

/**
 * /forex/candle response. `s` is `"ok"` or `"no_data"`; the OHLC arrays are
 * absent on `no_data`. Times are seconds since epoch.
 */
const FhCandleSchema = z.object({
  s: z.string(),
  t: z.array(z.number()).optional(),
  o: z.array(z.number()).optional(),
  h: z.array(z.number()).optional(),
  l: z.array(z.number()).optional(),
  c: z.array(z.number()).optional(),
  v: z.array(z.number()).optional(),
});

interface CallOptions {
  signal?: AbortSignal;
  apiKey: string;
  skipThrottle?: boolean;
}

async function call<T>(
  path: string,
  query: Record<string, string>,
  schema: z.ZodSchema<T>,
  opts: CallOptions,
): Promise<T> {
  if (!opts.skipThrottle && !tryReserve(PROVIDER, THROTTLE)) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set('token', opts.apiKey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason));
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    clearTimeout(timer);
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new ProviderError(
      res.status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  const json: unknown = await res.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'unexpected response shape', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export async function fetchPrice(symbol: Symbol, opts: CallOptions): Promise<{ price: number }> {
  const raw = await call('/quote', { symbol: toFinnhubSymbol(symbol) }, FhQuoteSchema, opts);
  // c == 0 means Finnhub doesn't have a quote for this symbol (e.g. weekend FX).
  if (raw.c === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty quote (market closed?)');
  }
  return { price: raw.c };
}

// ---------------------------------------------------------------------------
// Candles
// ---------------------------------------------------------------------------

export interface FinnhubCandle {
  /** ms epoch UTC. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface FetchCandlesArgs extends CallOptions {
  symbol: Symbol;
  tf: Timeframe;
  /** Number of bars to return. */
  count: number;
}

/**
 * Fetch up to `count` recent candles. For 4h we request 4× the bars at 1h
 * and aggregate. For other timeframes we use Finnhub's native resolution.
 *
 * Throws ProviderError on quota / HTTP failure / empty response so
 * `runWithFailover` can move to the next attempt.
 */
export async function fetchCandles(args: FetchCandlesArgs): Promise<FinnhubCandle[]> {
  if (args.tf === '4h') return fetch4hSynthesised(args);
  return fetchNative(args);
}

async function fetchNative(args: FetchCandlesArgs): Promise<FinnhubCandle[]> {
  const resolution = toFinnhubResolution(args.tf);
  const range = secondsForCount(args.tf, args.count);
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - range;

  const raw = await call(
    '/forex/candle',
    {
      symbol: toFinnhubSymbol(args.symbol),
      resolution,
      from: String(fromSec),
      to: String(nowSec),
    },
    FhCandleSchema,
    args,
  );

  if (raw.s !== 'ok' || !raw.t || raw.t.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, `empty candles (s=${raw.s})`);
  }

  const out: FinnhubCandle[] = [];
  for (let i = 0; i < raw.t.length; i += 1) {
    out.push({
      t: raw.t[i]! * 1000,
      o: raw.o![i]!,
      h: raw.h![i]!,
      l: raw.l![i]!,
      c: raw.c![i]!,
      v: raw.v ? raw.v[i] ?? null : null,
    });
  }
  return out.slice(-args.count);
}

async function fetch4hSynthesised(args: FetchCandlesArgs): Promise<FinnhubCandle[]> {
  // Pull enough 1h bars to assemble `count` 4h bars after aggregation.
  const oneH = await fetchNative({ ...args, tf: '1h', count: args.count * 4 + 4 });
  return synth4HFrom1H(oneH).slice(-args.count);
}

/**
 * Aggregate consecutive 1H bars into 4H bars. Bucket boundaries are the UTC
 * 4-hour blocks (00, 04, 08, 12, 16, 20). A bucket may contain fewer than
 * four bars at the edges of the window — we still emit it, but only when
 * non-empty. This is exported so it's easy to golden-test.
 */
export function synth4HFrom1H(bars: FinnhubCandle[]): FinnhubCandle[] {
  if (bars.length === 0) return [];
  const buckets = new Map<number, FinnhubCandle[]>();
  for (const b of bars) {
    const bucket = bucketStartMs(b.t, 4 * 60 * 60 * 1000);
    const list = buckets.get(bucket) ?? [];
    list.push(b);
    buckets.set(bucket, list);
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([t, group]) => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    let high = Number.NEGATIVE_INFINITY;
    let low = Number.POSITIVE_INFINITY;
    let v = 0;
    let hasV = false;
    for (const g of group) {
      if (g.h > high) high = g.h;
      if (g.l < low) low = g.l;
      if (g.v !== null) {
        v += g.v;
        hasV = true;
      }
    }
    return {
      t,
      o: first.o,
      h: high,
      l: low,
      c: last.c,
      v: hasV ? v : null,
    };
  });
}

function bucketStartMs(ms: number, sizeMs: number): number {
  return ms - (ms % sizeMs);
}

/**
 * Approximate seconds of history needed to capture `count` bars at `tf`.
 * Includes a 25 % buffer so weekend gaps and late-arriving bars don't
 * starve the response.
 */
function secondsForCount(tf: Timeframe, count: number): number {
  const TF_SEC: Record<Timeframe, number> = {
    '1m': 60,
    '5m': 5 * 60,
    '15m': 15 * 60,
    '30m': 30 * 60,
    '1h': 60 * 60,
    '4h': 4 * 60 * 60,
    '1d': 24 * 60 * 60,
    '1w': 7 * 24 * 60 * 60,
  };
  return Math.ceil(TF_SEC[tf] * count * 1.25);
}
