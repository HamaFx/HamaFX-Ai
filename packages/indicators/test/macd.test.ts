import { describe, expect, it } from 'vitest';

import { macd } from '../src/macd';
import { makeCandles } from './fixtures';

describe('macd', () => {
  it('returns full-null shape when not enough data', () => {
    const out = macd(makeCandles([1, 2, 3]), 12, 26, 9);
    expect(out).toHaveLength(3);
    for (const p of out) expect(p).toEqual({ macd: null, signal: null, hist: null });
  });

  it('computes macd with default 12/26/9 on a long series', () => {
    const closes: number[] = [];
    for (let i = 0; i < 60; i += 1) closes.push(100 + i + Math.sin(i / 3) * 5);
    const out = macd(makeCandles(closes), 12, 26, 9);
    const last = out.at(-1)!;
    expect(last.macd).not.toBeNull();
    expect(last.signal).not.toBeNull();
    expect(last.hist).not.toBeNull();
    // hist == macd - signal
    expect(last.hist!).toBeCloseTo(last.macd! - last.signal!, 10);
  });

  it('rejects fast >= slow', () => {
    expect(() => macd(makeCandles([1, 2, 3]), 12, 12, 9)).toThrow();
    expect(() => macd(makeCandles([1, 2, 3]), 26, 12, 9)).toThrow();
  });
});
