// Candles adapter — public surface for OHLC windows.
//
// Cache discipline: we cache the *closed-bar* portion of a window separately
// from the in-progress last bar. Phase-1a keeps it simple — one cache entry
// per (symbol, tf, count) bucket with TTL chosen by `lastBar=true` math
// (i.e. assume the window includes the live bar).
//
// Phase 2 added Finnhub as a fallback. The cache entry is provider-agnostic
// (one bucket per `(symbol, tf, count)` key), but the bars carry their own
// `source` field so downstream consumers can tell where they came from.
//
// Phase 7a: opt-in SWR via TTL policy + `getCandlesWithMeta` for callers
// that want to surface staleness.

import {
  CandleSchema,
  SymbolSchema,
  type Candle,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';

import { cacheKey, cacheTag, candleTtl, getDefaultCache } from '../cache';
import { ProviderError } from '../errors';
import { runWithFailover, type ProviderAttempt } from '../failover';
import * as finnhub from '../providers/finnhub';
import * as twelveData from '../providers/twelve-data';
import { parseTwelveDataDate } from '../providers/twelve-data/map';

export interface GetCandlesOptions {
  signal?: AbortSignal;
  /** Number of bars to request (capped at 5000 by upstream). Default 300. */
  count?: number;
  apiKeys?: Partial<{ twelveData: string; finnhub: string }>;
}

export interface CandlesResult {
  candles: Candle[];
  stale: boolean;
  producedAt: number;
}

const DEFAULT_COUNT = 300;
const MAX_COUNT = 5000;

function resolveKeys(opts: GetCandlesOptions) {
  return {
    twelveData: opts.apiKeys?.twelveData ?? process.env.TWELVEDATA_API_KEY ?? '',
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
  };
}

/**
 * OHLC candles, oldest-first, length up to `count` (default 300).
 *
 * Returns normalised `Candle[]` with `source` and `fetchedAt` tags. The
 * adapter never throws on partial data — if a provider returns fewer bars
 * than requested, that's what the caller gets. On a primary-provider
 * failure (quota, rate limit, HTTP), we fall back to Finnhub when its key
 * is configured. 4H is synthesised from 1H on the Finnhub side.
 */
export async function getCandles(
  symbolInput: Symbol,
  tf: Timeframe,
  opts: GetCandlesOptions = {},
): Promise<Candle[]> {
  const r = await getCandlesWithMeta(symbolInput, tf, opts);
  return r.candles;
}

/** SWR-aware variant. */
export async function getCandlesWithMeta(
  symbolInput: Symbol,
  tf: Timeframe,
  opts: GetCandlesOptions = {},
): Promise<CandlesResult> {
  const symbol = SymbolSchema.parse(symbolInput);
  const count = Math.max(1, Math.min(opts.count ?? DEFAULT_COUNT, MAX_COUNT));
  const keys = resolveKeys(opts);
  const policy = candleTtl(tf, true);

  const cache = await getDefaultCache();
  const key = cacheKey({ resource: 'candles', symbol, tf, extra: `n${count}` });
  const tags = [cacheTag('candles'), cacheTag('candles', symbol)];

  const r = await cache.fetchWithMeta<Candle[]>(
    key,
    async () => {
      const attempts: ProviderAttempt<Candle[]>[] = [];

      if (keys.twelveData) {
        attempts.push({
          name: 'twelve-data',
          run: async () => {
            const raw = await twelveData.fetchCandles(symbol, tf, count, {
              apiKey: keys.twelveData,
              ...(opts.signal ? { signal: opts.signal } : {}),
            });
            const fetchedAt = Date.now();
            return raw.map((bar) => {
              const parsed = CandleSchema.parse({
                symbol,
                tf,
                t: parseTwelveDataDate(bar.datetime),
                o: Number(bar.open),
                h: Number(bar.high),
                l: Number(bar.low),
                c: Number(bar.close),
                v: bar.volume !== undefined ? Number(bar.volume) : null,
                source: 'twelve-data',
                fetchedAt,
              });
              return parsed;
            });
          },
        });
      }

      if (keys.finnhub) {
        attempts.push({
          name: 'finnhub',
          run: async () => {
            const raw = await finnhub.fetchCandles({
              symbol,
              tf,
              count,
              apiKey: keys.finnhub,
              ...(opts.signal ? { signal: opts.signal } : {}),
            });
            const fetchedAt = Date.now();
            return raw.map((bar) =>
              CandleSchema.parse({
                symbol,
                tf,
                t: bar.t,
                o: bar.o,
                h: bar.h,
                l: bar.l,
                c: bar.c,
                v: bar.v,
                source: 'finnhub',
                fetchedAt,
              }),
            );
          },
        });
      }

      if (attempts.length === 0) {
        throw new ProviderError(
          'NO_PROVIDER_AVAILABLE',
          'none',
          'no candle provider configured (set TWELVEDATA_API_KEY or FINNHUB_API_KEY)',
        );
      }

      const { value } = await runWithFailover(attempts);
      return value;
    },
    { ttlSeconds: policy.ttlSeconds, maxStaleSeconds: policy.maxStaleSeconds, tags },
  );

  return { candles: r.value, stale: r.meta.stale, producedAt: r.meta.producedAt };
}
