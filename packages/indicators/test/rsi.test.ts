import { describe, expect, it } from 'vitest';

import { rsi } from '../src/rsi';
import { makeCandles } from './fixtures';

describe('rsi', () => {
  it('returns null for the first `period` entries', () => {
    const out = rsi(makeCandles([1, 2, 3, 4, 5, 6]), 3);
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).not.toBeNull();
  });

  it('returns 100 when only gains', () => {
    const out = rsi(makeCandles([1, 2, 3, 4, 5]), 3);
    expect(out.at(-1)).toBe(100);
  });

  it('returns 0 when only losses', () => {
    const out = rsi(makeCandles([5, 4, 3, 2, 1]), 3);
    expect(out.at(-1)).toBe(0);
  });

  it('lands inside (0, 100) for a mixed series', () => {
    const out = rsi(makeCandles([10, 11, 10, 12, 11, 13, 12, 14]), 3);
    const last = out.at(-1)!;
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThan(100);
  });

  it('all-null when not enough data', () => {
    expect(rsi(makeCandles([1, 2]), 14)).toEqual([null, null]);
  });
});
