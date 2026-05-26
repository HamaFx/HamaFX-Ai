import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetThrottle, tryReserve } from '../src/cache/throttle';

describe('tryReserve', () => {
  beforeEach(() => {
    _resetThrottle();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to limit calls per window then denies', () => {
    const cfg = { limit: 3, windowMs: 1000 };
    expect(tryReserve('p', cfg)).toBe(true);
    expect(tryReserve('p', cfg)).toBe(true);
    expect(tryReserve('p', cfg)).toBe(true);
    expect(tryReserve('p', cfg)).toBe(false);
  });

  it('rolls the window forward', () => {
    const cfg = { limit: 1, windowMs: 1000 };
    expect(tryReserve('p', cfg)).toBe(true);
    expect(tryReserve('p', cfg)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(tryReserve('p', cfg)).toBe(true);
  });

  it('keeps separate buckets per provider', () => {
    const cfg = { limit: 1, windowMs: 1000 };
    expect(tryReserve('a', cfg)).toBe(true);
    expect(tryReserve('b', cfg)).toBe(true);
    expect(tryReserve('a', cfg)).toBe(false);
    expect(tryReserve('b', cfg)).toBe(false);
  });
});
