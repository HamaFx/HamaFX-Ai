// Cache abstraction. Phase-1a uses the Next.js Data Cache (see ./nextjs.ts);
// `MemoryCache` covers tests and non-Next contexts. A future Redis-backed
// implementation would slot in here without touching adapter code.

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

  /** Revalidate everything tagged with `tag`. No-op if not supported. */
  invalidateTag?(tag: string): Promise<void> | void;
}
