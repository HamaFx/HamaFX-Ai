import type { Cache, CacheEntryMeta, CacheFetchOptions } from './types';

interface Entry<T> {
  value: T;
  /** ms epoch UTC when this entry was produced. */
  producedAt: number;
  /** ms epoch UTC when the entry's soft TTL expires. */
  expiresAt: number;
  /** ms epoch UTC past which the entry is no longer eligible for SWR. */
  hardExpiresAt: number;
  tags: ReadonlySet<string>;
}

/**
 * Process-local cache. Use it in tests and any non-Next context. In
 * production each Vercel function instance has its own copy, so this is
 * NOT a shared cache across replicas — that's fine for our use case
 * because the upstream provider quota is the constraint, not duplication.
 *
 * Phase 7a:
 *   - `fetchWithMeta` returns a freshness envelope.
 *   - When `maxStaleSeconds > 0` and the producer throws, the most recent
 *     cached value is served up to `expiresAt + maxStaleSeconds`.
 *   - Concurrent callers single-flight (existing behaviour, preserved).
 */
export class MemoryCache implements Cache {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

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
    const now = Date.now();
    const ttlMs = options.ttlSeconds * 1000;
    const swrMs = (options.maxStaleSeconds ?? 0) * 1000;
    const tags = options.tags ?? [];

    const hit = this.store.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > now) {
      return { value: hit.value, meta: { producedAt: hit.producedAt, stale: false } };
    }

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      const value = await existing;
      const fresh = this.store.get(key) as Entry<T> | undefined;
      const producedAt = fresh?.producedAt ?? Date.now();
      return { value, meta: { producedAt, stale: false } };
    }

    const promise = (async () => {
      try {
        const value = await producer();
        const producedAt = Date.now();
        this.store.set(key, {
          value,
          producedAt,
          expiresAt: producedAt + ttlMs,
          hardExpiresAt: producedAt + ttlMs + swrMs,
          tags: new Set(tags),
        });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);

    try {
      const value = await promise;
      return { value, meta: { producedAt: Date.now(), stale: false } };
    } catch (err) {
      // Stale-while-error fallback: if we still have a value within the
      // hard ceiling, hand it back and let the adapter mark it stale.
      if (hit && swrMs > 0 && hit.hardExpiresAt > now) {
        return {
          value: hit.value,
          meta: { producedAt: hit.producedAt, stale: true },
        };
      }
      throw err;
    }
  }

  invalidateTag(tag: string): void {
    for (const [key, entry] of this.store) {
      if (entry.tags.has(tag)) this.store.delete(key);
    }
  }

  /** Test helper. */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}
