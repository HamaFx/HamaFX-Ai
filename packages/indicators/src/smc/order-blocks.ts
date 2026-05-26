// Order block detection (simplified, structure-aware).
//
// Definition we use:
//   Bullish OB: the LAST bearish candle (close < open) before a sequence of
//     `impulseBars` consecutive bullish candles whose final close exceeds
//     the OB candle's HIGH.
//   Bearish OB: symmetric.
//
// This catches the most useful pattern (the "engulfed" candle that sourced
// an impulse) without the full ICT taxonomy. Phase 2 follow-ups can add
// "breaker blocks", "mitigation blocks", etc.

import type { Candle, OrderBlock } from '@hamafx/shared';

export interface DetectOrderBlocksOptions {
  /** How many consecutive impulse bars must follow the OB. Default 2. */
  impulseBars?: number;
}

export function detectOrderBlocks(
  candles: Candle[],
  opts: DetectOrderBlocksOptions = {},
): OrderBlock[] {
  const impulse = opts.impulseBars ?? 2;
  // Need 1 OB candle + `impulse` followers. Anything shorter can't form an OB.
  if (candles.length < impulse + 1) return [];

  const out: OrderBlock[] = [];

  for (let i = 0; i <= candles.length - impulse - 1; i += 1) {
    const c = candles[i]!;
    const isBearishCandle = c.c < c.o;
    const isBullishCandle = c.c > c.o;
    if (!isBearishCandle && !isBullishCandle) continue;

    // Look at the next `impulse` bars.
    const followers = candles.slice(i + 1, i + 1 + impulse);
    if (followers.length < impulse) break;

    if (isBearishCandle) {
      // Bullish OB candidate: all followers are bullish + last close > c.h.
      const allBull = followers.every((b) => b.c > b.o);
      if (!allBull) continue;
      const lastClose = followers[followers.length - 1]!.c;
      if (lastClose <= c.h) continue;

      out.push({
        side: 'bullish',
        index: i,
        time: c.t,
        top: c.h,
        bottom: c.l,
        mitigated: isMitigated(candles, i + 1 + impulse, candles.length, c.l, c.h),
      });
    } else if (isBullishCandle) {
      const allBear = followers.every((b) => b.c < b.o);
      if (!allBear) continue;
      const lastClose = followers[followers.length - 1]!.c;
      if (lastClose >= c.l) continue;

      out.push({
        side: 'bearish',
        index: i,
        time: c.t,
        top: c.h,
        bottom: c.l,
        mitigated: isMitigated(candles, i + 1 + impulse, candles.length, c.l, c.h),
      });
    }
  }

  // Keep only the most recent N order blocks per side; ancient ones are
  // rarely actionable. 10 each is plenty.
  return prune(out, 10);
}

function isMitigated(
  candles: Candle[],
  fromExclusive: number,
  toExclusive: number,
  bottom: number,
  top: number,
): boolean {
  for (let j = fromExclusive; j < toExclusive; j += 1) {
    const b = candles[j]!;
    if (b.l <= top && b.h >= bottom) return true;
  }
  return false;
}

function prune(obs: OrderBlock[], perSide: number): OrderBlock[] {
  const bull = obs.filter((o) => o.side === 'bullish').slice(-perSide);
  const bear = obs.filter((o) => o.side === 'bearish').slice(-perSide);
  return [...bull, ...bear].sort((a, b) => a.index - b.index);
}
