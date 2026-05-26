// Swing-point detection — local pivot highs/lows.
//
// A swing high at index i is a bar whose high is strictly greater than
// every other high in the surrounding 2k+1 window (k bars to each side).
// Mirror for swing lows. Equal highs at the same level are NOT counted as
// pivots because that's a flat top, not a swing — the user can still see
// the level on the chart, but for structure detection we want the strict
// version (otherwise BOS/CHoCH gets noisy on consolidations).
//
// Default k = 3 — captures meaningful swings on intraday charts without
// drowning in micro-pivots. Personal tuning: pass `lookback: 5` for cleaner
// daily-bias swings.

import type { Candle } from '@hamafx/shared';
import type { SwingPoint } from '@hamafx/shared';

export interface FindSwingsOptions {
  /** Bars on each side that must be strictly lower (high) / higher (low). */
  lookback?: number;
}

export function findSwings(candles: Candle[], opts: FindSwingsOptions = {}): SwingPoint[] {
  const k = opts.lookback ?? 3;
  if (k < 1) throw new Error('findSwings: lookback must be >= 1');
  if (candles.length < 2 * k + 1) return [];

  const out: SwingPoint[] = [];
  for (let i = k; i < candles.length - k; i += 1) {
    const c = candles[i]!;

    // Swing high: strictly above every neighbour in the [i-k, i+k] window.
    let isHigh = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      if (candles[j]!.h >= c.h) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      out.push({ index: i, time: c.t, price: c.h, type: 'high', lookback: k });
      continue;
    }

    // Swing low: strictly below every neighbour.
    let isLow = true;
    for (let j = i - k; j <= i + k; j += 1) {
      if (j === i) continue;
      if (candles[j]!.l <= c.l) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      out.push({ index: i, time: c.t, price: c.l, type: 'low', lookback: k });
    }
  }

  return out;
}
