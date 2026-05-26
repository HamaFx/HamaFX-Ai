import { describe, expect, it } from 'vitest';

import { detectStructure } from '../src/smc/structure';
import { findSwings } from '../src/smc/swings';
import type { Candle } from '@hamafx/shared';

function bar(i: number, o: number, h: number, l: number, c: number): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t: i * 3_600_000,
    o,
    h,
    l,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

describe('detectStructure', () => {
  it('returns empty when no swings or no candles', () => {
    expect(detectStructure([], [])).toEqual([]);
    expect(detectStructure([bar(0, 1, 2, 0, 1.5)], [])).toEqual([]);
  });

  it('emits a bullish BOS when price closes above a confirmed swing high', () => {
    // Build: clear swing high at index 3, then later bar closes above it.
    // 7 bars to confirm the swing (lookback 2 → swing confirmed at idx 5).
    // Bar 8 closes above swing high → bullish BOS.
    const candles = [
      bar(0, 1, 1.5, 0.5, 1.2),
      bar(1, 1.2, 2.0, 1.0, 1.8),
      bar(2, 1.8, 3.0, 1.5, 2.5),
      bar(3, 2.5, 5.0, 2.0, 4.0), // swing high at h=5.0
      bar(4, 4.0, 4.5, 3.0, 3.5),
      bar(5, 3.5, 4.0, 2.5, 3.0),
      bar(6, 3.0, 3.5, 2.0, 2.5),
      bar(7, 2.5, 4.5, 2.0, 4.0),
      bar(8, 4.0, 6.0, 3.5, 5.5), // closes above 5.0 → BOS
    ];
    const swings = findSwings(candles, { lookback: 2 });
    expect(swings.length).toBeGreaterThan(0);
    const events = detectStructure(candles, swings);
    expect(events.some((e) => e.kind === 'bos' && e.direction === 'bullish')).toBe(true);
  });

  it('emits CHoCH when an established uptrend gets a bearish close-break', () => {
    // First confirm an uptrend with a bullish BOS, then have price break a
    // recent swing low → CHoCH bearish. Fixtures use STRICTLY distinct
    // highs/lows so swings always qualify under k=2 lookback.
    const candles = [
      bar(0, 1.0, 1.5, 0.5, 1.2),
      bar(1, 1.2, 2.0, 1.0, 1.8),
      bar(2, 1.8, 3.0, 1.5, 2.5),
      bar(3, 2.5, 4.0, 2.0, 3.5), // strict swing high at h=4.0
      bar(4, 3.5, 3.8, 3.0, 3.2),
      bar(5, 3.2, 3.5, 1.8, 2.4), // strict swing low at l=1.8
      bar(6, 2.4, 3.0, 2.2, 2.8),
      bar(7, 2.8, 5.0, 2.5, 4.5), // closes above 4.0 → bullish BOS
      // Now drift higher then break the recent swing low.
      bar(8, 4.5, 5.5, 4.2, 5.0),
      bar(9, 5.0, 6.5, 4.5, 6.0), // strict new swing high at h=6.5
      bar(10, 6.0, 6.2, 4.0, 4.5),
      bar(11, 4.5, 4.7, 3.5, 3.8),
      bar(12, 3.8, 4.0, 2.5, 3.5), // strict swing low at l=2.5
      bar(13, 3.5, 3.8, 3.0, 3.2),
      bar(14, 3.2, 3.5, 1.0, 1.5), // closes below 2.5 → CHoCH bearish
    ];
    const swings = findSwings(candles, { lookback: 2 });
    const events = detectStructure(candles, swings);
    expect(events.some((e) => e.kind === 'bos' && e.direction === 'bullish')).toBe(true);
    expect(events.some((e) => e.kind === 'choch' && e.direction === 'bearish')).toBe(true);
  });

  it('does not double-emit when the same bar would break multiple stale highs', () => {
    // A bar that closes very high should only mark one BOS event.
    const candles = [
      bar(0, 1, 2, 0.5, 1.5),
      bar(1, 1.5, 2.5, 1, 2),
      bar(2, 2, 3, 1.5, 2.5),
      bar(3, 2.5, 4, 2, 3.5),
      bar(4, 3.5, 3.8, 3, 3.2),
      bar(5, 3.2, 3.5, 2.5, 2.8),
      bar(6, 2.8, 3, 2, 2.3),
      bar(7, 2.3, 10, 2, 9.5), // big rip
    ];
    const swings = findSwings(candles, { lookback: 2 });
    const events = detectStructure(candles, swings);
    const byBar = events.filter((e) => e.brokenAt === 7);
    expect(byBar.length).toBeLessThanOrEqual(1);
  });
});
