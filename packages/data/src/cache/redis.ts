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

// PF-14 — Redis-backed cache implementation.
//
// Provides a multi-instance, process-shared cache via Redis. Useful in the
// GCE VM worker (long-lived single process) and in horizontal-scaling Vercel
// deployments where MemoryCache is per-instance.
//
// Usage:
//   import { RedisCache } from './redis';
//   const cache = new RedisCache({ url: 'redis://localhost:6379' });
//   await cache.fetch('key', 60, async () => fetchFreshData());
//
// The implementation follows the same `Cache` interface as MemoryCache,
// so it can be swapped in transparently via `getDefaultCache()` or
// `setDefaultCache()`.

import { createClient, type RedisClientOptions, type RedisClientType } from 'redis';
import type { Cache, CacheEntryMeta, CacheFetchOptions } from './types';

/** Serialized value envelope stored in Redis. */
interface RedisValue<T> {
  v: T;
  p: number; // producedAt (ms epoch)
  h: number; // hardExpiresAt (ms epoch) — soft TTL + maxStaleSeconds
  t: string[]; // tags
}

/**
 * PF-14 — Redis-backed cache implementing the `Cache` interface.
 *
 * Design decisions:
 *   - Each key stores a JSON-serialized envelope with value + metadata.
 *   - TTL is enforced client-side (not Redis EXPIRE) so stale-while-error
 *     fallback is possible: the soft TTL is embedded in the envelope, and
 *     the key lives in Redis until the hardExpiresAt passes. A background
 *     cleanup sweeps expired envelopes lazily.
 *   - Tags are stored in a Redis Set `cache:tag:{tagName}` for tag-based
 *     invalidation via `invalidateTag()`.
 *   - Single-flighting is NOT done at the Redis level — the caller's
 *     `getDefaultCache()` tenant isolation provides single-flight per
 *     process. For worker processes, MemoryCache is preferred anyway.
 *     In multi-instance Vercel, single-flight across instances is a
 *     nice-to-have that can be added later.
 */
export class RedisCache implements Cache {
  private client: RedisClientType | null = null;
  private readonly url: string;
  private readonly keyPrefix: string;
  private connectPromise: Promise<void> | null = null;

  constructor(opts?: { url?: string; keyPrefix?: string }) {
    this.url = opts?.url ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.keyPrefix = opts?.keyPrefix ?? 'cache:';
  }

  /**
   * Lazy-connect to Redis. Connection is established on the first
   * cache operation, not at construction time, so the cache can be
   * instantiated unconditionally without requiring Redis to be up.
   */
  private async ensureConnected(): Promise<void> {
    if (this.client?.isOpen) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      const options: RedisClientOptions = { url: this.url };
      // socketTimeoutMs prevents operations from hanging on a
      // partitioned Redis node. 5s is generous for data reads.
      options.socket = { connectTimeout: 5_000, reconnectStrategy: false };
      const c = createClient(options) as RedisClientType;
c.on('error', (err: unknown) => {
        console.error('[RedisCache] connection error:', String(err));
      });
      await c.connect();
      this.client = c;
    })();

    try {
      await this.connectPromise;
    } catch (err) {
      this.connectPromise = null;
      throw err;
    }
  }

  private ledgerKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private tagKey(tag: string): string {
    return `${this.keyPrefix}tag:${tag}`;
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
    try {
      await this.ensureConnected();
    } catch {
      // Redis unavailable — skip cache, call producer directly.
      const value = await producer();
      return { value, meta: { producedAt: Date.now(), stale: false } };
    }

    const now = Date.now();
    const client = this.client!;
    const lKey = this.ledgerKey(key);
    const ttlMs = options.ttlSeconds * 1000;
    const swrMs = (options.maxStaleSeconds ?? 0) * 1000;

    // Try cache hit.
    try {
      const raw = await client.get(lKey);
      if (raw) {
        const entry = JSON.parse(raw) as RedisValue<T>;
        if (entry.p + ttlMs > now) {
          // Fresh hit within soft TTL.
          return { value: entry.v, meta: { producedAt: entry.p, stale: false } };
        }
        if (swrMs > 0 && entry.h > now) {
          // Stale-while-error window — return stale value but mark it.
          return { value: entry.v, meta: { producedAt: entry.p, stale: true } };
        }
        // Entry expired even past hard ceiling; remove it.
        await client.del(lKey).catch(() => {});
      }
    } catch {
      // Redis read error — fall through to producer.
    }

    // Cache miss or expired — call producer.
    try {
      const value = await producer();
      const producedAt = Date.now();
      const hardExpiresAt = producedAt + ttlMs + swrMs;

      const envelope: RedisValue<T> = {
        v: value,
        p: producedAt,
        h: hardExpiresAt,
        t: options.tags ?? [],
      };

      // Best-effort write to Redis.
      client.set(lKey, JSON.stringify(envelope)).catch(() => {});

      // Best-effort tag index.
      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          client.sAdd(this.tagKey(tag), lKey).catch(() => {});
        }
      }

      return { value, meta: { producedAt, stale: false } };
    } catch (err) {
      // Producer failed — check for stale-while-error fallback.
      try {
        const raw = await client.get(lKey);
        if (raw) {
          const entry = JSON.parse(raw) as RedisValue<T>;
          if (swrMs > 0 && entry.h > now) {
            return { value: entry.v, meta: { producedAt: entry.p, stale: true } };
          }
        }
      } catch {
        // Fallback read failed too — throw original error.
      }
      throw err;
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    try {
      await this.ensureConnected();
      const tKey = this.tagKey(tag);
      const members = await this.client!.sMembers(tKey);
      if (members.length > 0) {
        await this.client!.del([...members, tKey]);
      }
    } catch {
      // Best-effort invalidation.
    }
  }

  async clear(): Promise<void> {
    try {
      await this.ensureConnected();
      // WARNING: this clears ALL keys with the configured prefix.
      // Use with caution in production if multiple apps share the
      // same Redis instance.
      let cursor = 0;
      do {
        const result = await this.client!.scan(cursor, {
          MATCH: `${this.keyPrefix}*`,
          COUNT: 100,
        });
        cursor = result.cursor;
        if (result.keys.length > 0) {
          await this.client!.del(result.keys);
        }
      } while (cursor !== 0);
    } catch {
      // Best-effort clear.
    }
  }
}
