import type { Symbol, Timeframe } from '@hamafx/shared';

import { noteBackoff, tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';
import { isCryptoSymbol, toBinanceInterval } from './map';
import { parseKline, type NormalizedBinanceCandle } from './types';

const PROVIDER = 'binance';
const BASE_URL = 'https://api.binance.com';
const DEFAULT_TIMEOUT_MS = 8_000;

const THROTTLE: ThrottleConfig = { limit: 20, windowMs: 60_000 };

interface CallOptions {
  signal?: AbortSignal;
  skipThrottle?: boolean;
}

async function klinesCall(
  query: Record<string, string>,
  opts: CallOptions,
): Promise<NormalizedBinanceCandle[]> {
  if (!opts.skipThrottle && !(await tryReserve(PROVIDER, THROTTLE))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL(`${BASE_URL}/api/v3/klines`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

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
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

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
  if (!Array.isArray(json)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'expected array response');
  }

  const out: NormalizedBinanceCandle[] = [];
  for (const item of json) {
    if (!Array.isArray(item) || item.length < 11) {
      throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid kline array');
    }
    const k = parseKline(item as unknown[]);
    out.push({
      t: k.openTime,
      o: Number.parseFloat(k.open),
      h: Number.parseFloat(k.high),
      l: Number.parseFloat(k.low),
      c: Number.parseFloat(k.close),
      v: Number.parseFloat(k.volume),
    });
  }

  if (out.length === 0) {
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'empty kline response');
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}

export async function fetchCandles(
  symbol: Symbol,
  tf: Timeframe,
  count: number,
  opts: CallOptions = {},
): Promise<NormalizedBinanceCandle[]> {
  if (!isCryptoSymbol(symbol)) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `unsupported symbol "${symbol}" — binance only supports crypto pairs`,
    );
  }

  const interval = toBinanceInterval(tf);
  const limit = Math.min(count, 1000);

  return klinesCall(
    { symbol: symbol.toUpperCase(), interval, limit: String(limit) },
    opts,
  );
}

/**
 * GET /api/v3/ticker/price?symbol=BTCUSDT — 1 weight.
 * Lightweight price fetch returning just the current price.
 */
export async function fetchTickerPrice(
  symbol: string,
  opts?: { signal?: AbortSignal },
): Promise<number> {
  const url = new URL(`${BASE_URL}/api/v3/ticker/price`);
  url.searchParams.set('symbol', symbol.toUpperCase());

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (opts?.signal) {
    if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
    else opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  const json: unknown = await res.json().catch(() => null);
  if (!json || typeof json !== 'object' || !('price' in json)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'expected { price: string } response');
  }

  const price = Number.parseFloat((json as { price: string }).price);
  if (Number.isNaN(price)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid ticker price');
  }
  return price;
}
