// Finnhub REST client — fallback path for FX prices/candles.
//
// SCOPE: Phase 1a only ships the price endpoint. Full candle support and
// 4h synthesis land in Phase 1c when we wire the news side of Finnhub too.
// Calling `fetchCandles` today throws NO_PROVIDER_AVAILABLE so the adapter
// failover treats Finnhub as candle-incapable and falls through correctly.

import type { Symbol } from '@hamafx/shared';
import { z } from 'zod';

import { tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { toFinnhubSymbol } from './map';

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

export function fetchCandles(): Promise<never> {
  return Promise.reject(
    new ProviderError(
      'NO_PROVIDER_AVAILABLE',
      PROVIDER,
      'finnhub candle support is deferred to Phase 1c',
    ),
  );
}
