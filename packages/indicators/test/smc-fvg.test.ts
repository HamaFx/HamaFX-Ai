import type { Candle } from '@hamafx/shared';
import { describe, expect, it } from 'vitest';

import { detectFvgs } from '../src/smc/fvg';

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

describe('detectFvgs', () => {
  it('returns empty for fewer than 3 bars', () => {
    expect(detectFvgs([])).toEqual([]);
    expect(detectFvgs([bar(0, 1, 2, 1, 1.5), bar(1, 1.5, 2.5, 1.5, 2)])).toEqual([]);
  });

  it('detects a bullish FVG: bar1.high < bar3.low', () => {
    // Bar 0: 1.0 - 2.0
    // Bar 1: huge bull (impulse): 2.0 - 5.0
    // Bar 2: 3.0 - 5.5  → low (3.0) > bar0 high (2.0) → bullish FVG
    const candles = [
      bar(0, 1.5, 2.0, 1.0, 1.8),
      bar(1, 2.0, 5.0, 2.0, 4.8),
      bar(2, 4.8, 5.5, 3.0, 5.2),
    ];
    const fvgs = detectFvgs(candles);
    expect(fvgs).toHaveLength(1);
    expect(fvgs[0]).toMatchObject({
      side: 'bullish',
      startIndex: 0,
      endIndex: 2,
      bottom: 2.0,
      top: 3.0,
      mitigated: false,
    });
  });

  it('detects a bearish FVG: bar1.low > bar3.high', () => {
    const candles = [
      bar(0, 4.5, 5.0, 4.0, 4.2),
      bar(1, 4.2, 4.2, 1.5, 1.8),
      bar(2, 1.8, 3.0, 1.0, 1.2),
    ];
    const fvgs = detectFvgs(candles);
    expect(fvgs).toHaveLength(1);
    expect(fvgs[0]).toMatchObject({ side: 'bearish', bottom: 3.0, top: 4.0 });
  });

  it('marks an FVG as mitigated when a later bar wicks into the zone', () => {
    // Bullish FVG between bar0 high (2.0) and bar2 low (3.0).
    // Bar 3 wicks down to 2.5 → inside the gap → mitigated.
    const candles = [
      bar(0, 1.5, 2.0, 1.0, 1.8),
      bar(1, 2.0, 5.0, 2.0, 4.8),
      bar(2, 4.8, 5.5, 3.0, 5.2),
      bar(3, 5.2, 5.5, 2.5, 4.8),
    ];
    const fvgs = detectFvgs(candles);
    expect(fvgs[0]?.mitigated).toBe(true);
  });

  it('does not emit a gap when bar1 high == bar3 low (no strict gap)', () => {
    const candles = [
      bar(0, 1.5, 2.0, 1.0, 1.8),
      bar(1, 2.0, 5.0, 2.0, 4.8),
      bar(2, 4.8, 5.5, 2.0, 5.2), // low equals bar0 high — no gap
    ];
    expect(detectFvgs(candles)).toEqual([]);
  });

  it('respects minSizeRatio to filter tiny gaps', () => {
    // Bar 0 high=2.0, Bar 2 low=2.001 → gap of 0.001
    // Middle bar range = 5.0 - 2.0 = 3.0 → ratio = 0.0003 → below 0.01 default.
    const candles = [
      bar(0, 1.5, 2.0, 1.0, 1.8),
      bar(1, 2.0, 5.0, 2.0, 4.8),
      bar(2, 4.8, 5.5, 2.001, 5.2),
    ];
    expect(detectFvgs(candles, { minSizeRatio: 0.01 })).toEqual([]);
    expect(detectFvgs(candles, { minSizeRatio: 0 })).toHaveLength(1);
  });
});
