// Candles adapter — public surface for OHLC windows.
//
// Cache discipline: we cache the *closed-bar* portion of a window separately
// from the in-progress last bar. Phase-1a keeps it simple — one cache entry
// per (symbol, tf, count) bucket with TTL chosen by `lastBar=true` math
// (i.e. assume the window includes the live bar).

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
import * as twelveData from '../providers/twelve-data';
import { parseTwelveDataDate } from '../providers/twelve-data/map';

export interface GetCandlesOptions {
  signal?: AbortSignal;
  /** Number of bars to request (capped at 5000 by upstream). Default 300. */
  count?: number;
  apiKeys?: Partial<{ twelveData: string }>;
}

const DEFAULT_COUNT = 300;
const MAX_COUNT = 5000;

function resolveKeys(opts: GetCandlesOptions) {
  return { twelveData: opts.apiKeys?.twelveData ?? process.env.TWELVEDATA_API_KEY ?? '' };
}

/**
 * OHLC candles, oldest-first, length up to `count` (default 300).
 *
 * Returns normalised `Candle[]` with `source` and `fetchedAt` tags. The
 * adapter never throws on partial data — if a provider returns fewer bars
 * than requested, that's what the caller gets.
 */
export async function getCandles(
  symbolInput: Symbol,
  tf: Timeframe,
  opts: GetCandlesOptions = {},
): Promise<Candle[]> {
  const symbol = SymbolSchema.parse(symbolInput);
  const count = Math.max(1, Math.min(opts.count ?? DEFAULT_COUNT, MAX_COUNT));
  const keys = resolveKeys(opts);
  const policy = candleTtl(tf, true);

  const cache = await getDefaultCache();
  const key = cacheKey({ resource: 'candles', symbol, tf, extra: `n${count}` });
  const tags = [cacheTag('candles'), cacheTag('candles', symbol)];

  return cache.fetch<Candle[]>(
    key,
    policy.ttlSeconds,
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

      if (attempts.length === 0) {
        throw new ProviderError(
          'NO_PROVIDER_AVAILABLE',
          'none',
          'no candle provider configured (set TWELVEDATA_API_KEY)',
        );
      }

      const { value } = await runWithFailover(attempts);
      return value;
    },
    tags,
  );
}
