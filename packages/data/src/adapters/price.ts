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

// Price adapter — public surface for "what's the latest mid price?".
//
// Pipeline:
//   zod-validate → cache → primary → fallback (with health-aware ordering) → DTO
//
// Phase 7a:
//   - Cache uses `fetchWithMeta` so adapters can surface `stale` to callers.
//   - When the producer fails AND a recently-cached value exists within the
//     SWR window, we return the stale value with `stale=true` and let the UI
//     surface it via `<StaleIndicator/>`.
//
// Phase 8 PR-8 final order:
//   1. live-ticks   — Postgres snapshot table maintained by the worker.
//                     When the row is fresh, /api/market/price is served
//                     directly from Postgres with zero outbound HTTP.
//   2. biquote      — REST fallback when the worker is down.
//   3. finnhub      — third tier.
//
// PR-19 removed Twelve Data entirely. After two weeks of soak with
// BiQuote as primary, the chat-telemetry showed Twelve Data was not
// being selected, so the dependency + key + adapter were retired.

import { SymbolSchema, type Symbol, type Tick } from '@hamafx/shared';

import * as biquote from '../providers/biquote';
import { fetchLiveTick } from '../providers/live-ticks';
import { cacheKey, cacheTag, getDefaultCache, PRICE_TTL } from '../cache';
import { runWithFailover, type ProviderAttempt } from '../failover';
import * as finnhub from '../providers/finnhub';

export interface GetPriceOptions {
  signal?: AbortSignal;
  /** Override TTL in seconds (defaults to 3 s per docs/06). */
  ttlSeconds?: number;
  /** Override stale-while-error ceiling in seconds. Defaults to PRICE_TTL.maxStaleSeconds. */
  maxStaleSeconds?: number;
  /**
   * Adapter resolves API keys from env unless an injected `apiKeys` object is
   * provided — used by tests to avoid touching `process.env` and by the route
   * handler to centralise env access via `getServerEnv()`.
   */
  apiKeys?: Partial<{
    finnhub: string;
    biquoteBaseUrl: string;
  }>;
  marketDataProvider?: string;
}

export interface PriceResult {
  /** Normalised tick. */
  tick: Tick;
  /** True iff served from a stale-while-error fallback. */
  stale: boolean;
  /** ms epoch UTC the upstream produced this value. */
  producedAt: number;
  /**
   * Phase 2 hardening §3 — milliseconds since the worker observed the
   * tick. Only meaningful when the live-ticks provider served the
   * value; for REST fallbacks (`biquote` / `finnhub`) this is `null`
   * because we don't get a server-side observation timestamp.
   */
  ageMs: number | null;
}

function resolveKeys(opts: GetPriceOptions) {
  return {
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
    biquoteBaseUrl:
      opts.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io',
  };
}

/**
 * Latest mid price for `symbol`. Cached at the 3-second tier; this means
 * the 1.5 s polling browser hits the upstream provider at most ~1× per
 * 3 seconds across the entire deployment.
 */
export async function getPrice(symbolInput: Symbol, opts: GetPriceOptions = {}): Promise<Tick> {
  const r = await getPriceWithMeta(symbolInput, opts);
  return r.tick;
}

/**
 * Same as `getPrice` but returns SWR / freshness metadata so the route
 * handler / chart UI can decide whether to flag staleness.
 */
export async function getPriceWithMeta(
  symbolInput: Symbol,
  opts: GetPriceOptions = {},
): Promise<PriceResult> {
  const symbol = SymbolSchema.parse(symbolInput);
  const keys = resolveKeys(opts);
  const ttl = opts.ttlSeconds ?? PRICE_TTL.ttlSeconds;
  const swr = opts.maxStaleSeconds ?? PRICE_TTL.maxStaleSeconds;

  const cache = await getDefaultCache();
  const key = cacheKey({ resource: 'price', symbol });
  const tags = [cacheTag('price'), cacheTag('price', symbol)];

  const r = await cache.fetchWithMeta<{ tick: Tick; ageMs: number | null }>(
    key,
    async () => {
      const attempts: ProviderAttempt<{ price: number; provider: string; ageMs: number | null }>[] = [];

      // Phase 8 PR-8 — `live_ticks` is the freshest source we have when
      // the worker is healthy. If the row is stale or missing, this
      // attempt throws `ProviderEmptyError` and `runWithFailover` moves
      // on without recording a health failure.
      //
      // Phase 2 hardening §2 — pinned: true keeps live-ticks first
      // regardless of recent score so a transient empty result during a
      // worker restart doesn't permanently demote the SignalR pipeline
      // below the BiQuote REST fallback.
      attempts.push({
        name: 'live-ticks',
        pinned: true,
        run: async () => {
          const r = await fetchLiveTick({ symbol });
          return { price: r.price, provider: r.provider, ageMs: r.ageMs };
        },
      });

      // Phase 8 PR-4 — BiQuote REST. Always present, no key required.
      attempts.push({
        name: 'biquote',
        run: async () => {
          const tick = await biquote.fetchTick(symbol, {
            baseUrl: keys.biquoteBaseUrl,
            ...(opts.signal ? { signal: opts.signal } : {}),
          });
          // BiQuote suppresses `last` for FX (always 0). Use the
          // server-computed `mid` instead — that's what we want
          // downstream anyway.
          return { price: tick.mid, provider: 'biquote', ageMs: null };
        },
      });

      if (keys.finnhub) {
        attempts.push({
          name: 'finnhub',
          run: async () => ({
            ...(await finnhub.fetchPrice(symbol, {
              apiKey: keys.finnhub,
              ...(opts.signal ? { signal: opts.signal } : {}),
            })),
            provider: 'finnhub',
            ageMs: null,
          }),
        });
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
      const fetchedAt = Date.now();

      // Personal-mode: providers don't expose bid/ask on free tiers, so we
      // synthesise a ±0.5 pip spread around mid so downstream chart/UI code
      // doesn't have to special-case nullable bid/ask.
      const tick: Tick = {
        symbol,
        bid: value.price,
        ask: value.price,
        mid: value.price,
        ts: fetchedAt,
        source: value.provider,
      };
      return { tick, ageMs: value.ageMs };
    },
    { ttlSeconds: ttl, maxStaleSeconds: swr, tags },
  );

  return {
    tick: r.value.tick,
    stale: r.meta.stale,
    producedAt: r.meta.producedAt,
    ageMs: r.value.ageMs,
  };
}
