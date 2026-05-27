import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryCache } from '../src/cache/memory';

describe('MemoryCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches values for ttlSeconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
    const cache = new MemoryCache();
    let producerCalls = 0;
    const producer = async () => {
      producerCalls += 1;
      return producerCalls;
    };

    await expect(cache.fetch('k', 5, producer)).resolves.toBe(1);
    await expect(cache.fetch('k', 5, producer)).resolves.toBe(1);
    expect(producerCalls).toBe(1);

    vi.advanceTimersByTime(6_000);
    await expect(cache.fetch('k', 5, producer)).resolves.toBe(2);
    expect(producerCalls).toBe(2);
  });

  it('deduplicates concurrent in-flight requests (single-flight)', async () => {
    const cache = new MemoryCache();
    let callCount = 0;
    const producer = async () => {
      callCount += 1;
      await new Promise((r) => setTimeout(r, 10));
      return callCount;
    };

    const [a, b, c] = await Promise.all([
      cache.fetch('k', 5, producer),
      cache.fetch('k', 5, producer),
      cache.fetch('k', 5, producer),
    ]);
    expect([a, b, c]).toEqual([1, 1, 1]);
    expect(callCount).toBe(1);
  });

  it('invalidateTag removes tagged entries', async () => {
    const cache = new MemoryCache();
    let n = 0;
    const producer = async () => ++n;

    await cache.fetch('k', 60, producer, ['t1']);
    await cache.fetch('k2', 60, producer, ['t2']);
    cache.invalidateTag('t1');

    await expect(cache.fetch('k', 60, producer, ['t1'])).resolves.toBe(3); // refetched
    await expect(cache.fetch('k2', 60, producer, ['t2'])).resolves.toBe(2); // still cached
  });
});

describe('MemoryCache — Phase 7a SWR', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves stale value when producer fails within maxStaleSeconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
    const cache = new MemoryCache();

    // First call seeds the entry.
    let mode: 'ok' | 'fail' = 'ok';
    const producer = async () => {
      if (mode === 'fail') throw new Error('upstream down');
      return 'fresh';
    };

    const a = await cache.fetchWithMeta('k', producer, {
      ttlSeconds: 5,
      maxStaleSeconds: 30,
    });
    expect(a.value).toBe('fresh');
    expect(a.meta.stale).toBe(false);

    // After TTL expiry, force the producer to fail; expect stale fallback.
    vi.advanceTimersByTime(6_000);
    mode = 'fail';
    const b = await cache.fetchWithMeta('k', producer, {
      ttlSeconds: 5,
      maxStaleSeconds: 30,
    });
    expect(b.value).toBe('fresh');
    expect(b.meta.stale).toBe(true);
  });

  it('throws when producer fails past the SWR ceiling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
    const cache = new MemoryCache();

    let mode: 'ok' | 'fail' = 'ok';
    const producer = async () => {
      if (mode === 'fail') throw new Error('upstream down');
      return 1;
    };

    await cache.fetchWithMeta('k', producer, { ttlSeconds: 5, maxStaleSeconds: 10 });
    // Past TTL + maxStale.
    vi.advanceTimersByTime(20_000);
    mode = 'fail';
    await expect(
      cache.fetchWithMeta('k', producer, { ttlSeconds: 5, maxStaleSeconds: 10 }),
    ).rejects.toThrow('upstream down');
  });

  it('rethrows producer error when SWR is disabled (maxStaleSeconds=0)', async () => {
    const cache = new MemoryCache();

    let mode: 'ok' | 'fail' = 'ok';
    const producer = async () => {
      if (mode === 'fail') throw new Error('cold');
      return 'v';
    };

    // No prior cached value at all → should throw on miss + fail.
    mode = 'fail';
    await expect(
      cache.fetchWithMeta('cold-k', producer, { ttlSeconds: 5 }),
    ).rejects.toThrow('cold');
  });
});
