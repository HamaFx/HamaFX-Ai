// Simple and exponential moving averages.

import type { Candle } from '@hamafx/shared';

import { closes, padFront } from './util';

/**
 * Simple moving average over the last `period` closes. Output is aligned 1:1
 * with `candles`; the first `period - 1` entries are `null`.
 */
export function sma(candles: Candle[], period: number): (number | null)[] {
  if (period < 1) throw new Error('sma: period must be >= 1');
  const xs = closes(candles);
  if (xs.length < period) return Array(xs.length).fill(null);

  const out: number[] = [];
  // Use a rolling sum for O(n).
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += xs[i]!;
  out.push(sum / period);
  for (let i = period; i < xs.length; i += 1) {
    sum += xs[i]! - xs[i - period]!;
    out.push(sum / period);
  }
  return padFront(out, period - 1);
}

/**
 * Exponential moving average. Seeded with the SMA of the first `period`
 * closes (Wilders-style would use a different smoothing constant; for a
 * generic EMA we stick with `2 / (period + 1)`).
 */
export function ema(candles: Candle[], period: number): (number | null)[] {
  if (period < 1) throw new Error('ema: period must be >= 1');
  const xs = closes(candles);
  if (xs.length < period) return Array(xs.length).fill(null);

  const k = 2 / (period + 1);
  const out: number[] = [];

  // Seed: SMA of first `period` values.
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += xs[i]!;
  let prev = seed / period;
  out.push(prev);

  for (let i = period; i < xs.length; i += 1) {
    prev = (xs[i]! - prev) * k + prev;
    out.push(prev);
  }
  return padFront(out, period - 1);
}
