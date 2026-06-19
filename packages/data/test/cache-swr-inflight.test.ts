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

// Phase 2 hardening §7 — concurrent callers riding the in-flight
// promise should see the SWR fallback when the producer throws.
//
// Pre-fix the in-flight handler awaited the existing promise and
// re-threw on rejection, which meant the second caller errored out
// even though a stale value was eligible to be served.

import { describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/cache/memory';

describe('MemoryCache.fetchWithMeta — SWR + single-flight', () => {
  it('serves the cached value on a producer error within the SWR window', async () => {
    const cache = new MemoryCache();
    const key = 'test:swr';

    // Seed a successful value.
    await cache.fetchWithMeta(key, async () => 'fresh-1', {
      ttlSeconds: 0.1, // 100 ms
      maxStaleSeconds: 5,
    });

    // Wait past TTL, then fail the producer. We expect the previous
    // value back with `stale: true`.
    await new Promise((r) => setTimeout(r, 150));
    const r = await cache.fetchWithMeta(
      key,
      async () => {
        throw new Error('producer down');
      },
      { ttlSeconds: 0.1, maxStaleSeconds: 5 },
    );
    expect(r.value).toBe('fresh-1');
    expect(r.meta.stale).toBe(true);
  });

  it('all concurrent in-flight callers receive the SWR fallback when the producer fails', async () => {
    const cache = new MemoryCache();
    const key = 'test:swr-concurrent';

    // Seed.
    await cache.fetchWithMeta(key, async () => 'cached', {
      ttlSeconds: 0.05,
      maxStaleSeconds: 5,
    });
    await new Promise((r) => setTimeout(r, 80));

    // Two concurrent callers. The first owns the producer; the second
    // rides the in-flight promise. When the producer rejects, BOTH
    // callers should still get the cached value.
    let resolveProducer!: (v: string) => void;
    let rejectProducer!: (e: Error) => void;
    const producer = new Promise<string>((resolve, reject) => {
      resolveProducer = resolve;
      rejectProducer = reject;
    });

    const a = cache.fetchWithMeta(key, async () => producer, {
      ttlSeconds: 0.05,
      maxStaleSeconds: 5,
    });
    const b = cache.fetchWithMeta(key, async () => producer, {
      ttlSeconds: 0.05,
      maxStaleSeconds: 5,
    });

    rejectProducer(new Error('upstream 503'));
    void resolveProducer; // silence unused

    const [aResult, bResult] = await Promise.all([a, b]);
    expect(aResult.value).toBe('cached');
    expect(aResult.meta.stale).toBe(true);
    expect(bResult.value).toBe('cached');
    expect(bResult.meta.stale).toBe(true);
  });

  it('single-flights — only the first caller actually invokes the producer', async () => {
    const cache = new MemoryCache();
    const key = 'test:single-flight';

    let calls = 0;
    let resolveProducer!: (v: string) => void;
    const producer = new Promise<string>((resolve) => {
      resolveProducer = resolve;
    });
    const p = (): Promise<string> => {
      calls += 1;
      return producer;
    };

    const a = cache.fetchWithMeta(key, p, { ttlSeconds: 1 });
    const b = cache.fetchWithMeta(key, p, { ttlSeconds: 1 });
    const c = cache.fetchWithMeta(key, p, { ttlSeconds: 1 });

    resolveProducer('shared');
    const [ar, br, cr] = await Promise.all([a, b, c]);
    expect(ar.value).toBe('shared');
    expect(br.value).toBe('shared');
    expect(cr.value).toBe('shared');
    expect(calls).toBe(1);
  });

  it('rethrows when the producer fails AND no SWR-eligible value exists', async () => {
    const cache = new MemoryCache();
    await expect(
      cache.fetchWithMeta(
        'test:no-cache-no-fallback',
        async () => {
          throw new Error('cold cache + producer down');
        },
        { ttlSeconds: 1, maxStaleSeconds: 5 },
      ),
    ).rejects.toThrow(/cold cache/);
  });
});
