import type { Symbol, Timeframe } from '@hamafx/shared';
import { z } from 'zod';

import { noteBackoff, tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { toTwelveDataInterval } from './map';
import type { NormalizedTwelveDataCandle } from './types';
import { TwelveDataBarSchema, TwelveDataTimeSeriesMetaSchema } from './types';

const PROVIDER = 'twelvedata';
const BASE_URL = 'https://api.twelvedata.com';
const DEFAULT_TIMEOUT_MS = 10_000;

const THROTTLE: ThrottleConfig = { limit: 7, windowMs: 60_000 };

interface CallOptions {
  signal?: AbortSignal;
  apiKey: string;
  skipThrottle?: boolean;
}

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

const TwelveDataErrorResponseSchema = z.object({
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

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', opts.apiKey);

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

  const json = await rawFetch('/time_series', { symbol, interval, outputsize: String(outputsize) }, opts);
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
    const t = Date.parse(bar.datetime);
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

export async function fetchQuote(
  symbol: Symbol,
  opts: CallOptions,
): Promise<{ price: number }> {
  const json = await rawFetch('/quote', { symbol }, opts);
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
