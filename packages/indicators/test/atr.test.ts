import { describe, expect, it } from 'vitest';

import { atr } from '../src/atr';
import { makeCandles } from './fixtures';

describe('atr', () => {
  it('returns all-null when length <= period', () => {
    const out = atr(makeCandles([1, 2, 3]), 14);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('produces a positive value once seeded', () => {
    // 20 bars with monotone closes; highs=closes+1, lows=closes-1
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const out = atr(makeCandles(closes), 14);
    const last = out.at(-1);
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThan(0);
  });
});
