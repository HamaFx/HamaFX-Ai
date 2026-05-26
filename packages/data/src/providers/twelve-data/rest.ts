// Twelve Data REST client. Thin wrapper around `fetch` that:
//   1. Adds the API key as a query param.
//   2. Times out after `signal`/default 8 s.
//   3. Coerces non-2xx + Twelve-Data error envelopes into ProviderError.
//   4. Returns the *raw* JSON shape — DTO mapping happens in adapters.
//
// Endpoint reference:
//   - /price       : https://api.twelvedata.com/price?symbol=XAU/USD&apikey=...
//   - /time_series : https://api.twelvedata.com/time_series?symbol=...&interval=...&outputsize=...
//
// Twelve Data's error response shape:
//   { "code": 429, "message": "...", "status": "error" }

import type { Symbol, Timeframe } from '@hamafx/shared';
import { z } from 'zod';

import { tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { toTwelveDataInterval, toTwelveDataSymbol } from './map';

const PROVIDER = 'twelve-data';
const BASE_URL = 'https://api.twelvedata.com';
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Self-throttle config. Twelve Data's free tier is 8 req/min; we cap at 6 to
 * leave headroom for retries and to handle the period boundary cleanly.
 */
const THROTTLE: ThrottleConfig = { limit: 6, windowMs: 60_000 };

const TdErrorEnvelopeSchema = z.object({
  code: z.number(),
  message: z.string(),
  status: z.literal('error'),
});

const TdPriceSchema = z.object({
  price: z.string(),
});

const TdCandleSchema = z.object({
  datetime: z.string(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string().optional(),
});

const TdTimeSeriesSchema = z.object({
  meta: z.object({
    symbol: z.string(),
    interval: z.string(),
  }),
  values: z.array(TdCandleSchema),
  status: z.literal('ok'),
});

export type TdCandle = z.infer<typeof TdCandleSchema>;

interface CallOptions {
  signal?: AbortSignal;
  /** Override the throttle reservation (used by tests). */
  skipThrottle?: boolean;
  apiKey: string;
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
  url.searchParams.set('apikey', opts.apiKey);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  // Compose external signal with our timeout signal.
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      signal: ctrl.signal,
      // Important: we do NOT use Next's `next.revalidate` here. Caching is
      // applied a layer above by the Cache interface so providers stay
      // framework-neutral and testable.
      cache: 'no-store',
    });
  } catch (cause) {
    clearTimeout(t);
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  }
  clearTimeout(t);

  if (!res.ok) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid JSON', { cause });
  }

  // Detect Twelve Data's error envelope (200 OK + {status:"error"}).
  const errEnv = TdErrorEnvelopeSchema.safeParse(json);
  if (errEnv.success) {
    const isQuota = errEnv.data.code === 429 || /credit|limit|usage/i.test(errEnv.data.message);
    throw new ProviderError(
      isQuota ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      errEnv.data.message,
      { status: errEnv.data.code },
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError(
      'PROVIDER_PARSE_ERROR',
      PROVIDER,
      `unexpected response shape: ${parsed.error.issues
        .map((i) => i.path.join('.'))
        .slice(0, 3)
        .join(', ')}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

/** Latest mid price for a symbol. */
export async function fetchPrice(symbol: Symbol, opts: CallOptions): Promise<{ price: number }> {
  const raw = await call('/price', { symbol: toTwelveDataSymbol(symbol) }, TdPriceSchema, opts);
  const price = Number(raw.price);
  if (!Number.isFinite(price)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, `non-numeric price "${raw.price}"`);
  }
  return { price };
}

/** OHLC candle window. `outputSize` capped at 5000 by the upstream API. */
export async function fetchCandles(
  symbol: Symbol,
  tf: Timeframe,
  outputSize: number,
  opts: CallOptions,
): Promise<TdCandle[]> {
  const size = Math.max(1, Math.min(outputSize, 5000));
  const raw = await call(
    '/time_series',
    {
      symbol: toTwelveDataSymbol(symbol),
      interval: toTwelveDataInterval(tf),
      outputsize: String(size),
      // Twelve Data orders newest-first by default; we ask for oldest-first
      // so chart libs and indicator code can iterate naturally.
      order: 'ASC',
      timezone: 'UTC',
    },
    TdTimeSeriesSchema,
    opts,
  );
  return raw.values;
}
