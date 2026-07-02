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

// Public surface of the cache module. Adapter code only imports from here.
// Pick the runtime cache via `getDefaultCache()` so tests/scripts can swap
// in an in-memory cache without touching consumer code.
//
// Phase 3 §3.10 — tenant-scoped caches. The global singleton `_cache` has been
// replaced with a `Map<tenantId, Cache>` so one tenant's cached data can never
// leak into another tenant's request. Callers that don't supply a `tenantId`
// get a shared `__global__` cache (preserving legacy / self-host compatibility
// where there is only one user).

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

/** Sentinel for the unscoped (legacy / self-host) cache namespace. */
const GLOBAL_TENANT = '__global__';

/**
 * Per-tenant cache registry. Each tenant gets its own `Cache` instance so
 * cached values are isolated. In the Next.js runtime each entry is a
 * `NextjsCache` (which wraps a `MemoryCache`); elsewhere it's a plain
 * `MemoryCache`.
 */
const _tenantCaches = new Map<string, Cache>();

/**
 * Resolve the cache implementation for the given tenant. Each tenant
 * gets its own isolated `Cache` instance.
 *
 *  - Inside Next.js (`process.env.NEXT_RUNTIME` set, OR `next/cache` resolves):
 *    uses a per-tenant `MemoryCache` (the Next.js Data Cache is
 *    request-scoped and doesn't provide cross-tenant isolation guarantees).
 *  - Otherwise (tests, scripts, plain Node): uses a per-tenant `MemoryCache`.
 *
 * @param tenantId  The tenant identifier (typically `userId`). Omit for
 *                  the shared global cache (legacy / self-host compatibility).
 */
export async function getDefaultCache(tenantId?: string): Promise<Cache> {
  const ns = tenantId ?? GLOBAL_TENANT;
  const existing = _tenantCaches.get(ns);
  if (existing) return existing;

  const cache = new MemoryCache();
  _tenantCaches.set(ns, cache);
  return cache;
}

/** Synchronous accessor — only safe AFTER a `getDefaultCache()` await. */
export function getDefaultCacheSync(tenantId?: string): Cache {
  const ns = tenantId ?? GLOBAL_TENANT;
  const existing = _tenantCaches.get(ns);
  if (existing) return existing;
  const cache = new MemoryCache();
  _tenantCaches.set(ns, cache);
  return cache;
}

/** Test/override hook — sets the cache for a specific tenant namespace. */
export function setDefaultCache(c: Cache, tenantId?: string): void {
  _tenantCaches.set(tenantId ?? GLOBAL_TENANT, c);
}

/**
 * Phase 3 §3.10 — clear all tenant caches. Primarily for tests.
 */
export function clearAllTenantCaches(): void {
  _tenantCaches.clear();
}
