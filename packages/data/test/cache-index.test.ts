import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getDefaultCacheSync,
  setDefaultCache,
  clearAllTenantCaches,
} from '../src/cache/index';

describe('getDefaultCacheSync', () => {
  beforeEach(() => {
    clearAllTenantCaches();
  });

  it('returns a cache instance for a tenant', () => {
    const cache = getDefaultCacheSync('tenant-1');
    expect(cache).toBeDefined();
    expect(typeof cache.fetch).toBe('function');
    expect(typeof cache.invalidateTag).toBe('function');
    expect(typeof cache.clear).toBe('function');
  });

  it('returns the same cache for the same tenant on repeated calls', () => {
    const a = getDefaultCacheSync('tenant-1');
    const b = getDefaultCacheSync('tenant-1');
    expect(a).toBe(b); // same instance (by reference)
  });

  it('returns different caches for different tenants', () => {
    const a = getDefaultCacheSync('tenant-1');
    const b = getDefaultCacheSync('tenant-2');
    expect(a).not.toBe(b);
  });

  it('uses __global__ namespace when tenantId is omitted', () => {
    const cache = getDefaultCacheSync();
    expect(cache).toBeDefined();
  });

  it('returned cache supports fetch with producer', async () => {
    const cache = getDefaultCacheSync('test-tenant');
    const result = await cache.fetch('my-key', 60, async () => ({ data: 'value' }));
    expect(result).toEqual({ data: 'value' });

    // Second fetch returns cached value (producer not called)
    const cached = await cache.fetch('my-key', 60, async () => ({ data: 'different' }));
    expect(cached).toEqual({ data: 'value' });
  });
});

describe('setDefaultCache', () => {
  beforeEach(() => {
    clearAllTenantCaches();
  });

  it('replaces the cache for a specific tenant', () => {
    const original = getDefaultCacheSync('tenant-a');
    const replacement = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
    };

    setDefaultCache(replacement, 'tenant-a');

    const retrieved = getDefaultCacheSync('tenant-a');
    expect(retrieved).toBe(replacement);
    expect(retrieved).not.toBe(original);
  });

  it('works without tenantId for global namespace', () => {
    const replacement = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
    };
    setDefaultCache(replacement);
    expect(getDefaultCacheSync()).toBe(replacement);
  });
});

describe('clearAllTenantCaches', () => {
  it('removes all cached tenants', () => {
    const a = getDefaultCacheSync('tenant-x');
    const b = getDefaultCacheSync('tenant-y');

    clearAllTenantCaches();

    // After clear, getDefaultCacheSync creates new instances
    const a2 = getDefaultCacheSync('tenant-x');
    const b2 = getDefaultCacheSync('tenant-y');
    expect(a2).not.toBe(a);
    expect(b2).not.toBe(b);
  });

  it('is safe to call multiple times', () => {
    clearAllTenantCaches();
    clearAllTenantCaches();
    clearAllTenantCaches();
    // Should not throw
  });
});
