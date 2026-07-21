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
  //   Forex/Gold (EURUSD, XAUUSD)     → biquote → finnhub
  //   1m:                              candles-1m (pinned) → above
  //   1w:                              finnhub (biquote unsupported)

import {
  SymbolSchema,
  type Candle,
  type Symbol,
  type Timeframe,
} from '@hamafx/shared';

import { cacheKey, cacheTag, candleTtl, getDefaultCache } from '../cache';
import { ProviderError } from '../errors';
import { runWithFailover, type ProviderAttempt } from '../failover';

// P2-2 — Build provider attempts from the plugin registry instead of
// hardcoded imports. Adding a new provider means registering a plugin
// — no adapter code changes (OCP).
import '../providers/provider-adapters'; // side-effect: register providers
import { marketDataProviders } from '../providers/provider-registry';

export interface GetCandlesOptions {
  signal?: AbortSignal;
  /** Number of bars to request (capped at 5000 by upstream). Default 300. */
  count?: number;
  apiKeys?: Partial<{ finnhub: string; biquoteBaseUrl: string }>;
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

  const cache = await getDefaultCache();
  const key = cacheKey({ resource: 'candles', symbol, tf, extra: `n${count}` });
  const tags = [cacheTag('candles'), cacheTag('candles', symbol)];

  const r = await cache.fetchWithMeta<Candle[]>(
    key,
    async () => {
      // P2-2 — Build provider attempts from the plugin registry.
      // Providers declare their own fetchCandles logic (category routing,
      // key guards, timeframe filtering) via optional supports()/fetchCandles()
      // — the adapter just iterates and runs failover.
      const providers = marketDataProviders.list();
      const attempts: ProviderAttempt<Candle[]>[] = providers
        .filter((p) => typeof p.fetchCandles === 'function' && (p.supports?.(symbol, tf) ?? true))
        .map((p) => ({
          name: p.name,
          pinned: p.pinned ?? false,
          run: async () => {
            const c = await p.fetchCandles!(symbol, tf, count, {
              ...(opts.signal ? { signal: opts.signal } : {}),
              apiKey: keys.finnhub,
              baseUrl: keys.biquoteBaseUrl,
            });
            if (!c) throw new ProviderError('PROVIDER_HTTP_ERROR', p.name, 'provider returned null for symbol/tf');
            return c;
          },
        }));

      if (attempts.length === 0) {
        throw new ProviderError(
          'NO_PROVIDER_AVAILABLE',
          'none',
          'no candle provider configured — set FINNHUB_API_KEY or ensure a provider supports this symbol/timeframe',
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
