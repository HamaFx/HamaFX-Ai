import { describe, expect, it } from 'vitest';
import { computePdhPdl } from '../src/smc/pdh-pdl';
import type { Candle } from '@hamafx/shared';

function makeCandle(h: number, l: number, t: number): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t,
    o: (h + l) / 2,
    h,
    l,
    c: (h + l) / 2,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

// 2025-01-15 10:00 UTC
const BASE_TS = 1_736_935_200_000;

describe('computePdhPdl', () => {
  it('returns null for empty candles', () => {
    expect(computePdhPdl([])).toBeNull();
  });

  it('returns null when only one day of data exists', () => {
    const candles = [
      makeCandle(2010, 2000, BASE_TS),
      makeCandle(2015, 2005, BASE_TS + 3600000),
    ];
    expect(computePdhPdl(candles)).toBeNull();
  });

  it('computes PDH/PDL from the previous UTC day', () => {
    // Day 1: 2025-01-14 - previous day candles
    const day1 = BASE_TS - 86400000;
    // Day 2: 2025-01-15 - today's candles
    const day2 = BASE_TS;

    const candles = [
      makeCandle(2005, 2000, day1 + 2 * 3600000), // day 1, low at 2000
      makeCandle(2015, 2008, day1 + 5 * 3600000), // day 1, high at 2015
      makeCandle(2010, 2003, day2),                // day 2
      makeCandle(2020, 2007, day2 + 2 * 3600000), // day 2
    ];

    const result = computePdhPdl(candles);
    expect(result).not.toBeNull();
    expect(result!.high).toBe(2015);
    expect(result!.low).toBe(2000);
    expect(result!.date).toBe('2025-01-14');
  });

  it('records highTime and lowTime', () => {
    const day1 = BASE_TS - 86400000;
    const day2 = BASE_TS;

    const highTime = day1 + 5 * 3600000;
    const lowTime = day1 + 2 * 3600000;

    const candles = [
      makeCandle(2005, 2000, lowTime),
      makeCandle(2015, 2008, highTime),
      makeCandle(2010, 2003, day2),
    ];

    const result = computePdhPdl(candles);
    expect(result!.highTime).toBe(highTime);
    expect(result!.lowTime).toBe(lowTime);
  });

  it('handles multiple days, skipping days with no bars', () => {
    // Day 1: bars present
    const day1 = BASE_TS - 2 * 86400000;
    // Day 2: no bars (weekend)
    // Day 3: today's bars
    const day3 = BASE_TS;

    const candles = [
      makeCandle(3000, 2900, day1 + 3600000),
      makeCandle(3100, 2950, day1 + 2 * 3600000),
      makeCandle(3050, 2980, day3),
    ];

    const result = computePdhPdl(candles);
    expect(result).not.toBeNull();
    // Previous day with data is day1 (day2 has no bars)
    expect(result!.high).toBe(3100);
    expect(result!.low).toBe(2900);
  });
});
