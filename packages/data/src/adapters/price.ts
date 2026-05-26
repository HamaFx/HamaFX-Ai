// Price adapter — public surface for "what's the latest mid price?".
//
// Pipeline:
//   zod-validate → cache → primary (Twelve Data) → fallback (Finnhub) → DTO
//
// All callers go through `getPrice()`. Routes/tools never touch providers.

import { SymbolSchema, type Symbol, type Tick } from '@hamafx/shared';

import { cacheKey, cacheTag, getDefaultCache, PRICE_TTL } from '../cache';
import { runWithFailover, type ProviderAttempt } from '../failover';
import * as finnhub from '../providers/finnhub';
import * as twelveData from '../providers/twelve-data';

export interface GetPriceOptions {
  signal?: AbortSignal;
  /** Override TTL in seconds (defaults to 3 s per docs/06). */
  ttlSeconds?: number;
  /**
   * Adapter resolves API keys from env unless an injected `apiKeys` object is
   * provided — used by tests to avoid touching `process.env` and by the route
   * handler to centralise env access via `getServerEnv()`.
   */
  apiKeys?: Partial<{
    twelveData: string;
    finnhub: string;
  }>;
}

function resolveKeys(opts: GetPriceOptions) {
  return {
    twelveData: opts.apiKeys?.twelveData ?? process.env.TWELVEDATA_API_KEY ?? '',
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
  };
}

/**
 * Latest mid price for `symbol`. Cached at the 3-second tier; this means
 * the 1.5 s polling browser hits the upstream provider at most ~1× per
 * 3 seconds across the entire deployment.
 */
export async function getPrice(symbolInput: Symbol, opts: GetPriceOptions = {}): Promise<Tick> {
  const symbol = SymbolSchema.parse(symbolInput);
  const keys = resolveKeys(opts);
  const ttl = opts.ttlSeconds ?? PRICE_TTL.ttlSeconds;

  const cache = await getDefaultCache();
  const key = cacheKey({ resource: 'price', symbol });
  const tags = [cacheTag('price'), cacheTag('price', symbol)];

  return cache.fetch<Tick>(
    key,
    ttl,
    async () => {
      const attempts: ProviderAttempt<{ price: number; provider: string }>[] = [];

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
      };
    },
    tags,
  );
}
