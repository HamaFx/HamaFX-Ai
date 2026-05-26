import type { Cache } from './types';

interface Entry<T> {
  value: T;
  /** ms epoch UTC when this entry expires. */
  expiresAt: number;
  tags: ReadonlySet<string>;
}

/**
 * Process-local cache. Use it in tests and any non-Next context. In
 * production each Vercel function instance has its own copy, so this is
 * NOT a shared cache across replicas — that's fine for our use case
 * because the upstream provider quota is the constraint, not duplication.
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
    const now = Date.now();
    const hit = this.store.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > now) return hit.value;

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = (async () => {
      try {
        const value = await producer();
        this.store.set(key, {
          value,
          expiresAt: Date.now() + ttlSeconds * 1000,
          tags: new Set(tags),
        });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
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
