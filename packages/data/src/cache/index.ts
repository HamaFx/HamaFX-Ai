// Public surface of the cache module. Adapter code only imports from here.
// Pick the runtime cache via `getDefaultCache()` so tests/scripts can swap
// in an in-memory cache without touching consumer code.

import { MemoryCache } from './memory';
import type { Cache } from './types';

export type { Cache, CacheEntryMeta, CacheFetchOptions } from './types';
export { MemoryCache } from './memory';
export { cacheKey, cacheTag, type CacheResource, type KeyParts } from './keys';
export {
  PRICE_TTL,
  candleTtl,
  NEWS_LIST_TTL,
  NEWS_ARTICLE_TTL,
  CALENDAR_DAY_TTL,
  CALENDAR_WEEK_TTL,
  FRED_SERIES_TTL,
  type TtlPolicy,
} from './ttl';
export { tryReserve, noteBackoff, type ThrottleConfig, _resetThrottle } from './throttle';

/**
 * Resolve the default cache implementation for the current runtime.
 *
 *  - Inside Next.js (`process.env.NEXT_RUNTIME` set, OR `next/cache` resolves):
 *    use `nextjsCache` so values persist across invocations via Vercel's
 *    Data Cache.
 *  - Otherwise (tests, scripts, plain Node): use `MemoryCache`.
 *
 * The dynamic import keeps `next` an optional peer dep — `packages/data`
 * still type-checks and tests run without `next` installed.
 */
let _cache: Cache | null = null;

export async function getDefaultCache(): Promise<Cache> {
  if (_cache) return _cache;
  if (process.env.NEXT_RUNTIME || process.env.NEXT_PHASE) {
    try {
      const mod = (await import('./nextjs')) as { nextjsCache: Cache };
      _cache = mod.nextjsCache;
      return _cache;
    } catch {
      /* fall through to memory */
    }
  }
  _cache = new MemoryCache();
  return _cache;
}

/** Synchronous accessor — only safe AFTER a `getDefaultCache()` await. */
export function getDefaultCacheSync(): Cache {
  if (!_cache) _cache = new MemoryCache();
  return _cache;
}

/** Test/override hook. */
export function setDefaultCache(c: Cache): void {
  _cache = c;
}
