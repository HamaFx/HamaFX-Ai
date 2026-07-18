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
  listStorageObjects,
  deleteStorageObjects,
  type SupabaseStorageEnv,
  type StorageObjectInfo,
} from './adapters/storage';

export {
  getDefaultCache,
  getDefaultCacheSync,
  setDefaultCache,
  clearAllTenantCaches,
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
export * as binance from './providers/binance';
export * as biquote from './providers/biquote';
export { type MarketDataProvider } from './providers/market-data-provider';
export {
  MARKET_DATA_PROVIDERS,
  biquoteProvider,
  finnhubProvider,
  liveTicksProvider,
  binanceProvider,
} from './providers/market-data-providers';

// STAB-05: Circuit breaker — per-provider CLOSED/OPEN/HALF_OPEN state machine.
export {
  getCircuitBreaker,
  _resetAllBreakers,
  type CircuitBreaker,
  type CircuitBreakerOptions,
  type CircuitState,
} from './circuit-breaker';
