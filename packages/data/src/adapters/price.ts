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
// Phase 8 PR-4:
//   - BiQuote (free, no key) becomes the **first** attempt; Twelve Data
//     drops to the second attempt as a transitional fallback. PR-19 deletes
//     the Twelve Data path entirely once BiQuote has soaked.

import { SymbolSchema, type Symbol, type Tick } from '@hamafx/shared';

import * as biquote from '../providers/biquote';
import { cacheKey, cacheTag, getDefaultCache, PRICE_TTL } from '../cache';
import { runWithFailover, type ProviderAttempt } from '../failover';
import * as finnhub from '../providers/finnhub';
import * as twelveData from '../providers/twelve-data';

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
   *
   * `biquoteBaseUrl` is optional too — defaults to BIQUOTE_BASE_URL or the
   * canonical https://biquote.io endpoint.
   */
  apiKeys?: Partial<{
    twelveData: string;
    finnhub: string;
    biquoteBaseUrl: string;
  }>;
}

export interface PriceResult {
  /** Normalised tick. */
  tick: Tick;
  /** True iff served from a stale-while-error fallback. */
  stale: boolean;
  /** ms epoch UTC the upstream produced this value. */
  producedAt: number;
}

function resolveKeys(opts: GetPriceOptions) {
  return {
    twelveData: opts.apiKeys?.twelveData ?? process.env.TWELVEDATA_API_KEY ?? '',
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

  const r = await cache.fetchWithMeta<Tick>(
    key,
    async () => {
      const attempts: ProviderAttempt<{ price: number; provider: string }>[] = [];

      // Phase 8 — BiQuote first. No key required, so it's always present.
      attempts.push({
        name: 'biquote',
        run: async () => {
          const tick = await biquote.fetchTick(symbol, {
            baseUrl: keys.biquoteBaseUrl,
            ...(opts.signal ? { signal: opts.signal } : {}),
          });
          // BiQuote's `last` mirrors the most recent traded price; for FX
          // this equals mid in practice. We forward `last` so the synthesis
          // below sees the freshest number.
          return { price: tick.last, provider: 'biquote' };
        },
      });

      if (keys.twelveData) {
        attempts.push({
          name: 'twelve-data',
          run: async () => ({
            ...(await twelveData.fetchPrice(symbol, {
              apiKey: keys.twelveData,
              ...(opts.signal ? { signal: opts.signal } : {}),
            })),
            provider: 'twelve-data',
          }),
        });
      }
      if (keys.finnhub) {
        attempts.push({
          name: 'finnhub',
          run: async () => ({
            ...(await finnhub.fetchPrice(symbol, {
              apiKey: keys.finnhub,
              ...(opts.signal ? { signal: opts.signal } : {}),
            })),
            provider: 'finnhub',
          }),
        });
      }

      const { value } = await runWithFailover(attempts);
      const fetchedAt = Date.now();

      // Personal-mode: providers don't expose bid/ask on free tiers, so we
      // synthesise a ±0.5 pip spread around mid so downstream chart/UI code
      // doesn't have to special-case nullable bid/ask.
      return {
        symbol,
        bid: value.price,
        ask: value.price,
        mid: value.price,
        ts: fetchedAt,
        source: value.provider,
      } satisfies Tick;
    },
    { ttlSeconds: ttl, maxStaleSeconds: swr, tags },
  );

  return { tick: r.value, stale: r.meta.stale, producedAt: r.meta.producedAt };
}
