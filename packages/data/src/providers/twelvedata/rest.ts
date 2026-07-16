import { checkAndIncrementDailyQuota } from '@hamafx/db';
import type { Symbol, Timeframe } from '@hamafx/shared';
import { z } from 'zod';

import { noteBackoff, tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { toTwelveDataInterval, toTwelveDataSymbol } from './map';
import type { NormalizedTwelveDataCandle } from './types';
import { TwelveDataBarSchema, TwelveDataTimeSeriesMetaSchema } from './types';

const PROVIDER = 'twelvedata';
const BASE_URL = 'https://api.twelvedata.com';
const DEFAULT_TIMEOUT_MS = 10_000;

// Free tier: 8 req/min, 800/day. Self-throttle at 7 req/min to leave headroom.
const THROTTLE: ThrottleConfig = { limit: 7, windowMs: 60_000 };

// Daily quota enforced via DB-backed atomic counter (provider_daily_quota table).
// Free tier: 800 req/day, enforced at 800 (the counter is atomic so no
// per-instance drift; we let the provider's own 429 be the backstop).
const DAILY_MAX = 800;

interface CallOptions {
  signal?: AbortSignal;
  apiKey: string;
  skipThrottle?: boolean;
}

const TwelveDataPriceResponseSchema = z.object({
  status: z.literal('ok').optional(),
  symbol: z.string().optional(),
  price: z.string(),
});

const TwelveDataQuoteResponseSchema = z.object({
  status: z.literal('ok'),
  symbol: z.string(),
  close: z.string(),
  open: z.string().optional(),
  high: z.string().optional(),
  low: z.string().optional(),
  volume: z.string().optional(),
  previous_close: z.string().optional(),
  change: z.string().optional(),
  percent_change: z.string().optional(),
});

const TwelveDataTimeSeriesResponseSchema = z.object({
  status: z.literal('ok'),
  meta: TwelveDataTimeSeriesMetaSchema,
  values: z.array(TwelveDataBarSchema).optional(),
});

// BUG-5 fix: add status: z.literal('error') to error schema
const TwelveDataErrorResponseSchema = z.object({
  status: z.literal('error').optional(),
  code: z.number(),
  message: z.string(),
});

async function rawFetch(
  path: string,
  query: Record<string, string>,
  opts: CallOptions,
): Promise<unknown> {
  if (!opts.skipThrottle && !(await tryReserve(PROVIDER, THROTTLE))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  // Daily quota check (atomic DB-backed counter shared across all instances)
  if (!opts.skipThrottle) {
    const quota = await checkAndIncrementDailyQuota(PROVIDER, DAILY_MAX);
    if (!quota.allowed) {
      throw new ProviderError(
        'PROVIDER_QUOTA_EXCEEDED',
        PROVIDER,
        `Daily API quota exhausted (${DAILY_MAX}/day limit, current count: ${quota.count})`,
      );
    }
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', opts.apiKey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason), { once: true });
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
    if (res.status === 429) await noteBackoff(PROVIDER, THROTTLE);
    throw new ProviderError(
      res.status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  const json: unknown = await res.json().catch(() => null);
  const errParse = TwelveDataErrorResponseSchema.safeParse(json);
  if (errParse.success) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, errParse.data.message, {
      status: errParse.data.code,
    });
  }

  // OPT-5: Track api-credits-left header
  const creditsLeft = res.headers.get('api-credits-left');
  if (creditsLeft) {
    const remaining = Number(creditsLeft);
    if (!Number.isNaN(remaining) && remaining < 50) {
      console.warn(`[twelvedata] Low API credits: ${remaining} remaining`);
    }
  }

  // Daily quota already incremented atomically above — no module-level counter needed.

  return json;
}

export async function fetchCandles(
  symbol: Symbol,
  tf: Timeframe,
  count: number,
  opts: CallOptions,
): Promise<NormalizedTwelveDataCandle[]> {
  const interval = toTwelveDataInterval(tf);
  const outputsize = Math.min(count, 5000);

  const json = await rawFetch(
    '/time_series',
    {
      symbol: toTwelveDataSymbol(symbol),
      interval,
      outputsize: String(outputsize),
      // OPT-4: explicitly request ascending order
      order: 'asc',
      // OPT-6: force UTC timezone for consistent datetime parsing
      timezone: 'UTC',
    },
    opts,
  );
  const parsed = TwelveDataTimeSeriesResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'unexpected time_series response shape', {
      cause: parsed.error,
    });
  }

  if (!parsed.data.values || parsed.data.values.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty candle response');
  }

  const out: NormalizedTwelveDataCandle[] = [];
  for (const bar of parsed.data.values) {
    // ARCH-4 fix: Twelve Data returns "2026-07-03 15:30:00" (space-separated).
    // Replace space with 'T' to make it ISO-8601 parseable.
    const dtStr = bar.datetime.includes(' ') ? bar.datetime.replace(' ', 'T') : bar.datetime;
    const t = Date.parse(dtStr);
    if (Number.isNaN(t)) {
      throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, `invalid datetime "${bar.datetime}"`);
    }
    out.push({
      t,
      o: Number.parseFloat(bar.open),
      h: Number.parseFloat(bar.high),
      l: Number.parseFloat(bar.low),
      c: Number.parseFloat(bar.close),
      v: bar.volume ? Number.parseFloat(bar.volume) : null,
    });
  }

  if (out.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty candle data after parsing');
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * ARCH-6: Lightweight price fetch using the /price endpoint.
 * Returns just the current price — cheaper than /quote (less data).
 */
export async function fetchPrice(
  tdSymbol: string,
  opts: CallOptions,
): Promise<{ price: number }> {
  const json = await rawFetch('/price', { symbol: tdSymbol }, opts);
  const parsed = TwelveDataPriceResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'unexpected price response shape', {
      cause: parsed.error,
    });
  }

  const price = Number.parseFloat(parsed.data.price);
  if (Number.isNaN(price)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid price');
  }
  return { price };
}

export async function fetchQuote(
  symbol: Symbol,
  opts: CallOptions,
): Promise<{ price: number }> {
  const json = await rawFetch('/quote', { symbol: toTwelveDataSymbol(symbol) }, opts);
  const parsed = TwelveDataQuoteResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'unexpected quote response shape', {
      cause: parsed.error,
    });
  }

  const close = Number.parseFloat(parsed.data.close);
  if (Number.isNaN(close)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid quote price');
  }

  return { price: close };
}
