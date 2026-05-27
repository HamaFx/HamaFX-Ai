// Next.js Data Cache adapter. Wraps `unstable_cache` so adapter code stays
// framework-agnostic (it talks to the `Cache` interface, not Next directly).
//
// Why this instead of Upstash Redis? See docs/06-data-sources.md § Cache.
// TL;DR: free, persists across invocations on Vercel, single dependency.
//
// Why dynamic-import `next/cache` instead of a static dep? `@hamafx/data`
// must remain framework-neutral so it works in tests, scripts, and any
// future worker. We resolve `next/cache` at runtime; if Next isn't around
// (because we're outside of a request context, or there's no Next at all)
// the call falls back to the in-memory cache.
//
// Phase 7a additions:
//   - The cached value is wrapped as `{ v, t }` so we can return a
//     `producedAt` timestamp without an extra round-trip.
//   - A sidecar `MemoryCache` shadows every successful producer so that
//     when an `unstable_cache` miss meets a producer failure we can serve
//     a stale-while-error fallback.

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

interface Envelope<T> {
  v: T;
  /** ms epoch UTC when the producer ran. */
  t: number;
}

class NextjsCache implements Cache {
  private readonly fallback = new MemoryCache();

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
    const { ttlSeconds, maxStaleSeconds = 0, tags = [] } = options;
    const mod = await loadNextCacheModule();
    if (!mod) {
      return this.fallback.fetchWithMeta(key, producer, options);
    }

    // We pass a wrapped producer to unstable_cache so the cached value
    // carries its own `producedAt`. On producer success we ALSO write to
    // the sidecar so stale-while-error has something to return when the
    // primary path fails.
    const wrapped = async (): Promise<Envelope<T>> => {
      const value = await producer();
      const env: Envelope<T> = { v: value, t: Date.now() };
      // Mirror into the sidecar with the SAME ttl + maxStale so SWR math
      // stays consistent. This is intentionally synchronous-from-our-view;
      // the sidecar's own promise won't surface here.
      void this.fallback.fetchWithMeta(`mirror:${key}`, async () => value, {
        ttlSeconds,
        maxStaleSeconds,
        tags,
      });
      return env;
    };

    try {
      const cached = mod.unstable_cache(wrapped, [key], {
        revalidate: ttlSeconds,
        tags,
      });
      const env = await cached();
      return {
        value: env.v,
        meta: { producedAt: env.t, stale: false },
      };
    } catch (err) {
      if (maxStaleSeconds > 0) {
        try {
          // The sidecar might still hold a fresh-or-stale-but-eligible value.
          const stale = await this.fallback.fetchWithMeta(
            `mirror:${key}`,
            async () => {
              throw err;
            },
            { ttlSeconds, maxStaleSeconds, tags },
          );
          return { value: stale.value, meta: { ...stale.meta, stale: true } };
        } catch {
          /* fall through */
        }
      }
      throw err;
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    const mod = await loadNextCacheModule();
    if (!mod) {
      this.fallback.invalidateTag(tag);
      return;
    }
    try {
      mod.revalidateTag(tag);
    } catch {
      this.fallback.invalidateTag(tag);
    }
  }
}

export const nextjsCache: Cache = new NextjsCache();
