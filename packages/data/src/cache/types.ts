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

// Cache abstraction. Phase-1a uses the Next.js Data Cache (see ./nextjs.ts);
// `MemoryCache` covers tests and non-Next contexts. A future Redis-backed
// implementation would slot in here without touching adapter code.
//
// Phase 7a additions:
//   - `maxStaleSeconds` — opt-in stale-while-revalidate. When set, a producer
//     failure may resolve from the most recent cached value up to that age
//     past `ttlSeconds`. The adapter sees an explicit `{ value, stale }`
//     envelope when this kicks in.
//   - `fetchWithMeta` — the same producer but returns metadata so adapters
//     can stamp `source` / freshness onto DTOs.

export interface CacheEntryMeta {
  /** ms epoch UTC when the entry was produced. */
  producedAt: number;
  /** True iff this read came from a stale-while-error fallback. */
  stale: boolean;
}

export interface CacheFetchOptions {
  /** Soft TTL — cached value is served fresh for this long. */
  ttlSeconds: number;
  /**
   * Hard ceiling for stale-while-error fallback past `ttlSeconds`. 0 (the
   * default) disables the fallback — producer failures bubble up as before.
   */
  maxStaleSeconds?: number;
  /** Optional cache tags for grouped revalidation. */
  tags?: string[];
}

export interface Cache {
  /**
   * Memoise an async producer keyed by `key`. The producer is called on miss
   * and on TTL expiry; concurrent callers share the same in-flight result
   * (single-flight) for the lifetime of one fetch.
   *
   * @param key  Stable cache key — see `./keys.ts`.
   * @param ttlSeconds  Soft TTL: cached value served fresh for this long.
   * @param producer   Function that resolves a fresh value on miss.
   * @param tags       Optional cache tags for grouped revalidation.
   */
  fetch<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
    tags?: string[],
  ): Promise<T>;

  /**
   * Same as `fetch` but with an explicit options envelope and freshness
   * metadata. Adapters that need to surface staleness on the DTO use this
   * variant; existing call sites that don't care about staleness can keep
   * using `fetch`.
   */
  fetchWithMeta<T>(
    key: string,
    producer: () => Promise<T>,
    options: CacheFetchOptions,
  ): Promise<{ value: T; meta: CacheEntryMeta }>;

  /** Revalidate everything tagged with `tag`. No-op if not supported. */
  invalidateTag?(tag: string): Promise<void> | void;
}
