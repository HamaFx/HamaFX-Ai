// Public barrel for @hamafx/data. Routes / AI tools / hooks import from here.
// Adapter helpers (cache, failover) are also re-exported for advanced use.

export { getPrice, type GetPriceOptions } from './adapters/price';
export { getCandles, type GetCandlesOptions } from './adapters/candles';

export {
  getDefaultCache,
  setDefaultCache,
  MemoryCache,
  cacheKey,
  cacheTag,
  PRICE_TTL,
  candleTtl,
  type Cache,
  type CacheResource,
  type TtlPolicy,
} from './cache';

export { ProviderError, toAppError, type DataErrorCode } from './errors';
export { runWithFailover, type ProviderAttempt } from './failover';
