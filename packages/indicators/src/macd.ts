// MACD: difference of two EMAs, smoothed by a third EMA (the signal line).
// Defaults: 12 / 26 / 9.

import type { Candle } from '@hamafx/shared';

import { ema } from './moving-averages';

export interface MacdPoint {
  /** EMA(fast) - EMA(slow). */
  macd: number | null;
  /** EMA(signalPeriod, macd). */
  signal: number | null;
  /** macd - signal. */
  hist: number | null;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9): MacdPoint[] {
  if (fast < 1 || slow < 1 || signal < 1) throw new Error('macd: periods must be >= 1');
  if (fast >= slow) throw new Error('macd: fast must be < slow');

  const fastE = ema(candles, fast);
  const slowE = ema(candles, slow);
  const macdLine: (number | null)[] = candles.map((_c, i) => {
    const f = fastE[i];
    const s = slowE[i];
    return f === null || s === null || f === undefined || s === undefined ? null : f - s;
  });

  // Signal EMA computed over the macdLine itself — only over the segment
  // where macdLine is non-null.
  const startIdx = macdLine.findIndex((v) => v !== null);
  if (startIdx === -1) {
    return candles.map(() => ({ macd: null, signal: null, hist: null }));
  }
  const macdSlice = macdLine.slice(startIdx) as number[];

  const signalSlice = emaOfNumbers(macdSlice, signal);
  const out: MacdPoint[] = candles.map((_c, i) => {
    const m = macdLine[i];
    const localIdx = i - startIdx;
    const sig = localIdx >= 0 ? (signalSlice[localIdx] ?? null) : null;
    const hist =
      m !== null && sig !== null && m !== undefined && sig !== undefined ? m - sig : null;
    return { macd: m ?? null, signal: sig, hist };
  });
  return out;
}

/** EMA over a raw number series (used internally by MACD signal line). */
function emaOfNumbers(xs: number[], period: number): (number | null)[] {
  if (xs.length < period) return Array(xs.length).fill(null);
  const out: (number | null)[] = [];
  for (let i = 0; i < period - 1; i += 1) out.push(null);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += xs[i]!;
  let prev = seed / period;
  out.push(prev);
  const k = 2 / (period + 1);
  for (let i = period; i < xs.length; i += 1) {
    prev = (xs[i]! - prev) * k + prev;
    out.push(prev);
  }
  return out;
}
