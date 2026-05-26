import { describe, expect, it } from 'vitest';

import { findSwings } from '../src/smc/swings';
import type { Candle } from '@hamafx/shared';

function bar(idx: number, h: number, l: number, c: number = (h + l) / 2): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t: idx * 3_600_000,
    o: c,
    h,
    l,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

describe('findSwings', () => {
  it('returns empty when not enough bars to qualify a pivot', () => {
    expect(findSwings([bar(0, 1, 0)], { lookback: 3 })).toEqual([]);
    expect(findSwings(Array.from({ length: 6 }, (_, i) => bar(i, 1, 0)), { lookback: 3 })).toEqual(
      [],
    );
  });

  it('detects a clean swing high in the middle of a window', () => {
    // 7 bars, lookback k=3: only index 3 can qualify.
    // Highs:  1  2  3  10  3  2  1   → index 3 is a strict swing high.
    const candles = [
      bar(0, 1, 0),
      bar(1, 2, 1),
      bar(2, 3, 2),
      bar(3, 10, 4),
      bar(4, 3, 2),
      bar(5, 2, 1),
      bar(6, 1, 0),
    ];
    const swings = findSwings(candles, { lookback: 3 });
    expect(swings).toHaveLength(1);
    expect(swings[0]).toMatchObject({ index: 3, type: 'high', price: 10, lookback: 3 });
  });

  it('detects a swing low symmetrically', () => {
    const candles = [
      bar(0, 5, 4),
      bar(1, 4, 3),
      bar(2, 3, 2),
      bar(3, 4, 0),
      bar(4, 3, 2),
      bar(5, 4, 3),
      bar(6, 5, 4),
    ];
    const swings = findSwings(candles, { lookback: 3 });
    expect(swings).toHaveLength(1);
    expect(swings[0]).toMatchObject({ index: 3, type: 'low', price: 0 });
  });

  it('does not count flat tops as swing highs (strict > comparison)', () => {
    // Two bars at the same high → neither qualifies.
    const candles = [
      bar(0, 1, 0),
      bar(1, 2, 1),
      bar(2, 3, 2),
      bar(3, 5, 4),
      bar(4, 5, 4), // same high as bar 3
      bar(5, 4, 3),
      bar(6, 3, 2),
      bar(7, 2, 1),
    ];
    expect(findSwings(candles, { lookback: 3 })).toEqual([]);
  });

  it('finds multiple swings in a longer series', () => {
    const candles: Candle[] = [];
    // Build a zig-zag: peaks every 4 bars.
    const pattern = [1, 2, 3, 5, 3, 2, 1, 0, 1, 2, 4, 2, 1, 0];
    for (let i = 0; i < pattern.length; i += 1) {
      candles.push(bar(i, pattern[i]! + 0.5, pattern[i]! - 0.5));
    }
    const swings = findSwings(candles, { lookback: 3 });
    expect(swings.length).toBeGreaterThan(1);
    // Should include at least one high and one low.
    expect(swings.some((s) => s.type === 'high')).toBe(true);
    expect(swings.some((s) => s.type === 'low')).toBe(true);
  });

  it('rejects lookback < 1', () => {
    expect(() => findSwings([bar(0, 1, 0)], { lookback: 0 })).toThrow();
  });
});
