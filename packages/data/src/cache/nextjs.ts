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

import { MemoryCache } from './memory';
import type { Cache } from './types';

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
  private readonly fallback = new MemoryCache();

  async fetch<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
    tags: string[] = [],
  ): Promise<T> {
    const mod = await loadNextCacheModule();
    if (!mod) return this.fallback.fetch(key, ttlSeconds, producer, tags);

    // unstable_cache only works inside a Next request scope. When called from
    // a script / non-Next test it throws; fall back to the in-memory cache.
    try {
      const cached = mod.unstable_cache(() => producer(), [key], {
        revalidate: ttlSeconds,
        tags,
      });
      return await cached();
    } catch {
      return this.fallback.fetch(key, ttlSeconds, producer, tags);
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
