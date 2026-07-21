import { describe, expect, it } from 'vitest';

// computeDailySnapshot imports indicator functions that need mocking
// since we only want to test the pure orchestration logic.
import { computeDailySnapshot, previousUtcMidnight } from '../src/snapshots/compute';
import type { Candle } from '@hamafx/shared';

function makeCandle(overrides: Partial<Candle> = {}): Candle {
  return {
    t: 0, o: 100, h: 110, l: 90, c: 105, v: 1000,
    ...overrides,
  };
}

describe('computeDailySnapshot', () => {
  const asOf = new Date('2026-07-20T00:00:00Z');
  // UTC midnight for July 20, 2026
  const asOfMs = Date.UTC(2026, 6, 20, 0, 0, 0, 0);
  const dayEndMs = asOfMs + 24 * 60 * 60 * 1000;

  it('returns nulls for empty candle array', () => {
    const result = computeDailySnapshot({ candles: [], asOf });
    expect(result.asOfMs).toBe(asOfMs);
    expect(result.open).toBeNull();
    expect(result.high).toBeNull();
    expect(result.low).toBeNull();
    expect(result.close).toBeNull();
  });

  it('returns nulls when no candles fall within the subject day', () => {
    const candles = [
      makeCandle({ t: asOfMs - 1000 }), // before midnight
      makeCandle({ t: dayEndMs }),      // exactly at midnight — NOT included (t >= asOfMs && t < dayEndMs)
    ];
    // dayEndMs is excluded by the strict less-than
    const result = computeDailySnapshot({ candles, asOf });
    expect(result.open).toBeNull();
    expect(result.high).toBeNull();
    expect(result.low).toBeNull();
    expect(result.close).toBeNull();
  });

  it('computes OHLC for one candle in subject day', () => {
    const candles = [
      makeCandle({ t: asOfMs + 1000, o: 100, h: 110, l: 95, c: 105 }),
    ];
    const result = computeDailySnapshot({ candles, asOf });
    expect(result.open).toBe(100);
    expect(result.high).toBe(110);
    expect(result.low).toBe(95);
    expect(result.close).toBe(105);
  });

  it('computes OHLC for multiple candles in subject day', () => {
    const candles = [
      makeCandle({ t: asOfMs + 1000, o: 100, h: 102, l: 98, c: 101 }),
      makeCandle({ t: asOfMs + 2000, o: 101, h: 115, l: 97, c: 110 }),
      makeCandle({ t: asOfMs + 3000, o: 110, h: 120, l: 105, c: 108 }),
    ];
    const result = computeDailySnapshot({ candles, asOf });
    expect(result.open).toBe(100);
    expect(result.high).toBe(120);
    expect(result.low).toBe(97);
    expect(result.close).toBe(108);
  });

  it('ignores candles outside the subject day', () => {
    const before = makeCandle({ t: asOfMs - 5000, o: 50, h: 60, l: 40, c: 55 });
    const subject = makeCandle({ t: asOfMs + 1000, o: 100, h: 110, l: 90, c: 105 });
    const after = makeCandle({ t: dayEndMs + 5000, o: 200, h: 210, l: 190, c: 205 });
    const result = computeDailySnapshot({ candles: [before, subject, after], asOf });
    expect(result.open).toBe(100);
    expect(result.high).toBe(110);
    expect(result.low).toBe(90);
    expect(result.close).toBe(105);
  });

  it('sets asOfMs to UTC midnight', () => {
    const candles = [makeCandle({ t: asOfMs + 1000 })];
    const result = computeDailySnapshot({ candles, asOf });
    expect(result.asOfMs).toBe(asOfMs);
    expect(new Date(result.asOfMs).getUTCHours()).toBe(0);
    expect(new Date(result.asOfMs).getUTCMinutes()).toBe(0);
  });
});

describe('previousUtcMidnight', () => {
  it('returns midnight of the previous UTC day', () => {
    // July 20, 2026 at noon UTC
    const now = Date.UTC(2026, 6, 20, 12, 0, 0, 0);
    const result = previousUtcMidnight(now);
    // Should be July 19, 2026 at midnight UTC
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(6); // July (0-indexed)
    expect(result.getUTCDate()).toBe(19);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });

  it('handles month boundary', () => {
    // July 1, 2026 at noon UTC
    const now = Date.UTC(2026, 6, 1, 12, 0, 0, 0);
    const result = previousUtcMidnight(now);
    // Should be June 30, 2026 at midnight UTC
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(5); // June
    expect(result.getUTCDate()).toBe(30);
  });

  it('handles year boundary', () => {
    // January 1, 2026 at noon UTC
    const now = Date.UTC(2026, 0, 1, 12, 0, 0, 0);
    const result = previousUtcMidnight(now);
    // Should be December 31, 2025 at midnight UTC
    expect(result.getUTCFullYear()).toBe(2025);
    expect(result.getUTCMonth()).toBe(11); // December
    expect(result.getUTCDate()).toBe(31);
  });
});
