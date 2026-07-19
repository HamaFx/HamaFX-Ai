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
 *
 * PERF-1: Bounded LRU + expired-entry sweep to prevent unbounded heap
 * growth in the persistent worker process.
 */
export class MemoryCache implements Cache {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number;

  constructor(opts?: { maxEntries?: number }) {
    this.maxEntries = opts?.maxEntries ?? 5000;
    // M2 (RELIABILITY_AUDIT_REPORT.md) — periodic sweep for ALL runtimes,
    // not just the long-lived worker. Vercel function instances can live
    // long enough (warm reuse) to accumulate expired entries that the lazy
    // sweep alone won't clear if the instance serves unique cache keys.
    // `unref()` keeps the timer from holding the process open.
    if (typeof process !== 'undefined') {
      const timer = setInterval(() => this.sweep(), 60_000);
      timer.unref();
    }
  }

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

    // Lazy sweep — bounded work per call.
    this.lazySweep();

    const hit = this.store.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > now) {
      // LRU: move to end of Map by re-inserting.
      this.store.delete(key);
      this.store.set(key, hit);
      return { value: hit.value, meta: { producedAt: hit.producedAt, stale: false } };
    }

    // Phase 2 hardening §7 — concurrent callers riding the in-flight
    // promise also need the SWR fallback. The pre-fix code awaited the
    // existing promise and re-threw on rejection; if a stale value was
    // available it never made it back to the second caller. The fix:
    // attach the same try/catch to both the producer-owner and the
    // followers, so all of them either get the fresh value or the
    // SWR-eligible cached value.
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) {
      try {
        const value = await existing;
        const fresh = this.store.get(key) as Entry<T> | undefined;
        const producedAt = fresh?.producedAt ?? Date.now();
        return { value, meta: { producedAt, stale: false } };
      } catch (err) {
        if (hit && swrMs > 0 && hit.hardExpiresAt > now) {
          return {
            value: hit.value,
            meta: { producedAt: hit.producedAt, stale: true },
          };
        }
        throw err;
      }
    }

    const promise = (async () => {
      try {
        const value = await producer();
        const producedAt = Date.now();
        this.evictIfNeeded();
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

  // ── PERF-1: bounded LRU + sweep ──────────────────────────────────────

  /**
   * Evict the least-recently-used entry when the store exceeds maxEntries.
   * Maps iterate in insertion order; the first key is the LRU entry.
   */
  private evictIfNeeded(): void {
    while (this.store.size >= this.maxEntries) {
      // Delete the first (oldest) entry — LRU eviction.
      const first = this.store.keys().next();
      if (first.done) break;
      this.store.delete(first.value);
    }
  }

  /**
   * Opportunistic sweep: delete a bounded number of entries whose
   * hardExpiresAt has passed. Called lazily on each fetchWithMeta.
   */
  private lazySweep(): void {
    const now = Date.now();
    let swept = 0;
    // M3: Increase to 128 for worker runtime — still bounded but catches
    // more expired entries per call, reducing stale memory in long-lived processes.
    const maxSweep = typeof process !== 'undefined' && process.env.HAMAFX_RUNTIME === 'worker' ? 128 : 32;
    for (const [key, entry] of this.store) {
      if (entry.hardExpiresAt < now) {
        this.store.delete(key);
        swept += 1;
        if (swept >= maxSweep) break;
      }
    }
  }

  /** Full sweep — called by the periodic worker timer. */
  sweep(): number {
    const now = Date.now();
    let swept = 0;
    for (const [key, entry] of this.store) {
      if (entry.hardExpiresAt < now) {
        this.store.delete(key);
        swept += 1;
      }
    }
    return swept;
  }

  /** Test helper. */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  /** Expose store size for tests. */
  get size(): number {
    return this.store.size;
  }
}
