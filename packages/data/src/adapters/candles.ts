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

// Candles adapter — public surface for OHLC windows.
//
// Cache discipline: we cache the *closed-bar* portion of a window separately
// from the in-progress last bar. Phase-1a keeps it simple — one cache entry
// per (symbol, tf, count) bucket with TTL chosen by `lastBar=true` math
// (i.e. assume the window includes the live bar).
//
// Phase 7a: opt-in SWR via TTL policy + `getCandlesWithMeta` for callers
// that want to surface staleness.
//
// Symbol routing:
//   Crypto (BTCUSDT, ETHUSDT, etc.) → binance → biquote → finnhub
//   Forex/Gold (EURUSD, XAUUSD)     → biquote → twelvedata → finnhub
//   1m:                              candles-1m (pinned) → above
//   1w:                              finnhub (biquote unsupported)

import {
  CandleSchema,
  SymbolSchema,
  type Candle,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';

import * as biquote from '../providers/biquote';
import * as twelvedata from '../providers/twelvedata';
import * as binance from '../providers/binance';
import { isCryptoSymbol } from '../providers/binance/map';
import { fetchCandles1m } from '../providers/candles-1m';
import { cacheKey, cacheTag, candleTtl, getDefaultCache } from '../cache';
import { ProviderError } from '../errors';
import { runWithFailover, type ProviderAttempt } from '../failover';
import * as finnhub from '../providers/finnhub';

export interface GetCandlesOptions {
  signal?: AbortSignal;
  /** Number of bars to request (capped at 5000 by upstream). Default 300. */
  count?: number;
  apiKeys?: Partial<{ finnhub: string; biquoteBaseUrl: string; twelvedata: string }>;
  marketDataProvider?: string;
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
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
    twelvedata: opts.apiKeys?.twelvedata ?? process.env.TWELVEDATA_API_KEY ?? '',
    biquoteBaseUrl:
      opts.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io',
  };
}

/**
 * OHLC candles, oldest-first, length up to `count` (default 300).
 *
 * Returns normalised `Candle[]` with `source` and `fetchedAt` tags. The
 * adapter never throws on partial data — if a provider returns fewer bars
 * than requested, that's what the caller gets. On a primary-provider
 * failure (quota, rate limit, HTTP), we fall back to subsequent attempts.
 * 4H is synthesised from 1H on the Finnhub side.
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
  // BiQuote tops out at 2000 bars per series; cap our request to it but let
  // larger requests still flow through to Finnhub.
  const biquoteCount = Math.min(count, 2000);

  const cache = await getDefaultCache();
  const key = cacheKey({ resource: 'candles', symbol, tf, extra: `n${count}` });
  const tags = [cacheTag('candles'), cacheTag('candles', symbol)];

  const isCrypto = isCryptoSymbol(symbol);

  const r = await cache.fetchWithMeta<Candle[]>(
    key,
    async () => {
      const attempts: ProviderAttempt<Candle[]>[] = [];

      // Phase 8 PR-8 — `candles_1m` (worker-maintained) is the freshest
      // 1m source. Skip for non-1m timeframes (the table only stores 1m
      // bars; higher TFs come from BiQuote).
      //
      // Phase 2 hardening §2 — pinned so a transient empty result during
      // worker restart doesn't permanently demote this attempt below the
      // BiQuote REST fallback in the health-aware reorder.
      if (tf === '1m') {
        attempts.push({
          name: 'candles-1m',
          pinned: true,
          run: async () => {
            const r = await fetchCandles1m({ symbol, count });
            const fetchedAt = Date.now();
            return r.bars.map((bar) =>
              CandleSchema.parse({
                symbol,
                tf,
                t: bar.t,
                o: bar.o,
                h: bar.h,
                l: bar.l,
                c: bar.c,
                v: bar.v,
                source: r.provider,
                fetchedAt,
              }),
            );
          },
        });
      }

      // Crypto → Binance (primary).
      // Forex/Gold → BiQuote first (free, unlimited), then Twelve Data (800/day).
      if (isCrypto) {
        attempts.push({
          name: 'binance',
          run: async () => {
            const raw = await binance.fetchCandles(symbol, tf, count, {
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
                source: 'binance',
                fetchedAt,
              }),
            );
          },
        });
      }

      // BiQuote first for forex/gold (free, no rate limits).
      if (tf !== '1w') {
        attempts.push({
          name: 'biquote',
          run: async () => {
            const raw = await biquote.fetchOhlc({
              symbol,
              tf,
              count: biquoteCount,
              baseUrl: keys.biquoteBaseUrl,
              ...(opts.signal ? { signal: opts.signal } : {}),
            });
            const fetchedAt = Date.now();
            return raw.map((bar) =>
              CandleSchema.parse({
                symbol,
                tf,
                t: Date.parse(bar.openTime),
                o: bar.open,
                h: bar.high,
                l: bar.low,
                c: bar.close,
                // Forex volume is 0 from BiQuote; keep null in our DTO.
                v: bar.volume > 0 ? bar.volume : null,
                source: 'biquote',
                fetchedAt,
              }),
            );
          },
        });
      }

      // Twelve Data backup for forex/gold (800 req/day — preserve for real failures).
      if (!isCrypto && keys.twelvedata) {
        attempts.push({
          name: 'twelvedata',
          run: async () => {
            const raw = await twelvedata.fetchCandles(symbol, tf, count, {
              apiKey: keys.twelvedata,
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
                source: 'twelvedata',
                fetchedAt,
              }),
            );
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
        const missing = isCrypto ? 'use Binance' : 'set TWELVEDATA_API_KEY or FINNHUB_API_KEY or use BiQuote';
        throw new ProviderError(
          'NO_PROVIDER_AVAILABLE',
          'none',
          `no candle provider configured (${missing})`,
        );
      }

      if (opts.marketDataProvider) {
        attempts.forEach((attempt) => {
          if (attempt.name === opts.marketDataProvider) {
            attempt.pinned = true;
          } else {
            attempt.pinned = false;
          }
        });
        attempts.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
      }

      const { value } = await runWithFailover(attempts);
      return value;
    },
    { ttlSeconds: policy.ttlSeconds, maxStaleSeconds: policy.maxStaleSeconds, tags },
  );

  return { candles: r.value, stale: r.meta.stale, producedAt: r.meta.producedAt };
}
