// Tiny candle fixture used across indicator tests. Values picked so each
// indicator has a tractable hand-computable answer.

import type { Candle } from '@hamafx/shared';

export function makeCandles(
  closes: number[],
  opts?: { highs?: number[]; lows?: number[] },
): Candle[] {
  return closes.map((c, i) => ({
    symbol: 'XAUUSD' as const,
    tf: '1h' as const,
    t: i * 3_600_000,
    o: c,
    h: opts?.highs?.[i] ?? c + 1,
    l: opts?.lows?.[i] ?? c - 1,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  }));
}
