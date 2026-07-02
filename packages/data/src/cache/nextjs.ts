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

// Next.js Data Cache adapter. Wraps `unstable_cache` so adapter code stays
// framework-agnostic (it talks to the `Cache` interface, not Next directly).
//
// Why this instead of Upstash Redis? See docs/04-data-layer.md § Cache.
// TL;DR: free, persists across invocations on Vercel, single dependency.
//
// Why dynamic-import `next/cache` instead of a static dep? `@hamafx/data`
// must remain framework-neutral so it works in tests, scripts, and any
// future worker. We resolve `next/cache` at runtime; if Next isn't around
// (because we're outside of a request context, or there's no Next at all)
// the call falls back to the in-memory cache.
//
// Phase 2 hardening §7 — single-layer SWR.
//
// The pre-fix design ran a dual cache: `unstable_cache` as the primary
// and a `MemoryCache` mirror that owned SWR. Two bugs followed:
//
//   1. The mirror only refreshed on cache MISS, so during a long stable
//      window the mirror's TTL elapsed and SWR fallback failed when
//      actually needed (the mirror was empty).
//   2. The in-flight handler in `MemoryCache.fetchWithMeta` didn't apply
//      the SWR fallback — concurrent callers riding the producer's
//      promise threw on producer rejection even when a stale value was
//      available.
//
// The fix: own SWR + single-flight in `MemoryCache` (which has the
// authoritative producedAt + hard-expiry math) and stop using
// `unstable_cache` for the SWR contract entirely. We still call into
// Next's cache for the per-request `revalidateTag` propagation, but
// the value path is the in-memory tree. This is a deliberate
// simplification — we lose cross-instance reuse, but the upstream
// throttle is what protects the provider from over-call, not this
// cache.

import { MemoryCache } from './memory';
import type { Cache, CacheEntryMeta, CacheFetchOptions } from './types';

interface NextCacheModule {
  unstable_cache: <T>(
    fn: () => Promise<T>,
    keyParts: string[],
    options: { revalidate?: number; tags?: string[] },
  ) => () => Promise<T>;
  revalidateTag: (tag: string) => void;
}

let nextMod: NextCacheModule | null = null;
let nextModLoadFailed = false;

async function loadNextCacheModule(): Promise<NextCacheModule | null> {
  if (nextMod) return nextMod;
  if (nextModLoadFailed) return null;
  try {
    // The webpackIgnore comment tells webpack NOT to follow this dynamic
    // import — it stays a runtime `import()` evaluated by Node. Without it
    // we get a "Critical dependency: the request of a dependency is an
    // expression" warning on every build. The package is consumed in Next
    // (where `next/cache` resolves) and in Vitest (where it doesn't, and
    // the catch below kicks in).
    const specifier = 'next/cache';
    const mod = (await import(/* webpackIgnore: true */ specifier)) as NextCacheModule;
    nextMod = mod;
    return mod;
  } catch {
    nextModLoadFailed = true;
    return null;
  }
}

class NextjsCache implements Cache {
  private readonly inner = new MemoryCache();

  async fetch<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
    tags: string[] = [],
  ): Promise<T> {
    const r = await this.fetchWithMeta(key, producer, { ttlSeconds, tags });
    return r.value;
  }

  async fetchWithMeta<T>(
    key: string,
    producer: () => Promise<T>,
    options: CacheFetchOptions,
  ): Promise<{ value: T; meta: CacheEntryMeta }> {
    // The MemoryCache owns SWR + single-flight + producedAt math. The
    // producer is the same closure the adapter passed in — no mirror,
    // no envelope juggling.
    return this.inner.fetchWithMeta(key, producer, options);
  }

  async invalidateTag(tag: string): Promise<void> {
    // Tag-based invalidation still propagates through Next so other
    // request scopes (server actions, page revalidation) honour it.
    // The local MemoryCache invalidates the corresponding key set.
    this.inner.invalidateTag(tag);
    const mod = await loadNextCacheModule();
    if (!mod) return;
    try {
      mod.revalidateTag(tag);
    } catch {
      // Safe to swallow — the local invalidation already ran.
    }
  }
}

export const nextjsCache: Cache = new NextjsCache();
