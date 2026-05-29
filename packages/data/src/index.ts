// Public barrel for @hamafx/data. Routes / AI tools / hooks import from here.
// Adapter helpers (cache, failover) are also re-exported for advanced use.

export { getPrice, getPriceWithMeta, type GetPriceOptions, type PriceResult } from './adapters/price';
export { getCandles, getCandlesWithMeta, type GetCandlesOptions, type CandlesResult } from './adapters/candles';
export { fetchNews, articleIdFromUrl, type FetchNewsOptions } from './adapters/news';
export {
  fetchUpcomingEvents,
  CURATED_FRED_RELEASE_IDS,
  type FetchCalendarOptions,
} from './adapters/calendar';

export {
  getDefaultCache,
  setDefaultCache,
  MemoryCache,
  cacheKey,
  cacheTag,
  PRICE_TTL,
  candleTtl,
  type Cache,
  type CacheEntryMeta,
  type CacheFetchOptions,
  type CacheResource,
  type TtlPolicy,
} from './cache';

export { ProviderError, ProviderEmptyError, toAppError, type DataErrorCode } from './errors';
export { runWithFailover, type ProviderAttempt } from './failover';
export {
  getHealth,
  getScore,
  recordSuccess,
  recordFailure,
  type HealthSnapshot,
  _resetHealth,
} from './health';

// Phase 3 hardening §19 — re-export the worker-only providers so jobs
// don't have to deep-import past the package boundary. These pseudo-
// adapters don't expose a unified DTO (each is provider-specific), so
// we surface them under a namespace per provider rather than the
// adapter-style flat re-exports above.
export * as cftc from './providers/cftc';
export * as fred from './providers/fred';
