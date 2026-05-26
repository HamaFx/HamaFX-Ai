import { describe, expect, it } from 'vitest';

import { ema, sma } from '../src/moving-averages';
import { makeCandles } from './fixtures';

describe('sma', () => {
  it('returns null for the first period-1 entries', () => {
    const out = sma(makeCandles([1, 2, 3, 4, 5]), 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
  });

  it('computes the rolling average correctly', () => {
    const out = sma(makeCandles([1, 2, 3, 4, 5]), 3);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });

  it('returns all-null when length < period', () => {
    expect(sma(makeCandles([1, 2]), 5)).toEqual([null, null]);
  });

  it('rejects period < 1', () => {
    expect(() => sma(makeCandles([1]), 0)).toThrow();
  });
});

describe('ema', () => {
  it('seeds with sma of first period values', () => {
    const out = ema(makeCandles([1, 2, 3]), 3);
    expect(out[2]).toBe(2);
  });

  it('reacts faster than sma to fresh data', () => {
    const closes = [1, 1, 1, 1, 10];
    const e = ema(makeCandles(closes), 3);
    const s = sma(makeCandles(closes), 3);
    expect(e[4]!).toBeGreaterThan(s[4]!);
  });

  it('matches a hand-computed value', () => {
    // closes = [10, 11, 12, 13]; period = 3
    // seed (SMA of [10,11,12]) = 11
    // k = 2/(3+1) = 0.5
    // ema[3] = (13 - 11) * 0.5 + 11 = 12
    expect(ema(makeCandles([10, 11, 12, 13]), 3)[3]).toBe(12);
  });
});
