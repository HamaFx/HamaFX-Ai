// Liquidity sweep detection.
//
// A sweep is a bar whose wick spikes BEYOND a recent swing high/low and
// then closes BACK INSIDE. Marks where stops likely got hit; common
// reversal signal. We only consider swings already confirmed at the time
// of the sweep (per the swing's `lookback` confirmation lag).

import type { Candle, LiquiditySweep, SwingPoint } from '@hamafx/shared';

export interface DetectLiquiditySweepsOptions {
  /**
   * Maximum bars between the swing being swept and the sweep itself.
   * Older swings are usually too distant to be the actual liquidity. 200.
   */
  maxLookback?: number;
}

export function detectLiquiditySweeps(
  candles: Candle[],
  swings: SwingPoint[],
  opts: DetectLiquiditySweepsOptions = {},
): LiquiditySweep[] {
  const maxLookback = opts.maxLookback ?? 200;
  if (candles.length === 0 || swings.length === 0) return [];

  const out: LiquiditySweep[] = [];

  // For efficiency: separate highs / lows so we can binary-search the most
  // recent ones for each candle.
  const swingHighs = swings.filter((s) => s.type === 'high');
  const swingLows = swings.filter((s) => s.type === 'low');

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i]!;

    // Sweep of a swing-high: c.h > swing.price AND c.c < swing.price AND
    // the swing was confirmed by bar i (i.e. swing.index + swing.lookback <= i).
    for (let s = swingHighs.length - 1; s >= 0; s -= 1) {
      const sw = swingHighs[s]!;
      if (sw.index + sw.lookback > i) continue; // not confirmed yet at i
      if (sw.index >= i) continue; // can't sweep self
      if (i - sw.index > maxLookback) break;
      if (c.h > sw.price && c.c < sw.price) {
        out.push({ side: 'high', index: i, time: c.t, level: sw.price, wick: c.h });
        break; // one sweep per bar per side is enough
      }
    }

    for (let s = swingLows.length - 1; s >= 0; s -= 1) {
      const sw = swingLows[s]!;
      if (sw.index + sw.lookback > i) continue;
      if (sw.index >= i) continue;
      if (i - sw.index > maxLookback) break;
      if (c.l < sw.price && c.c > sw.price) {
        out.push({ side: 'low', index: i, time: c.t, level: sw.price, wick: c.l });
        break;
      }
    }
  }

  return out;
}
