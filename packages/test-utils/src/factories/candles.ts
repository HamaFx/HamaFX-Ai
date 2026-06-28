import type { Candle, Tick } from '@hamafx/shared';

export interface MakeCandlesOpts {
  highs?: number[];
  lows?: number[];
  symbol?: string;
  tf?: string;
  source?: string;
}

const BASE_TS = 1_700_000_000_000;

export function makeCandles(
  closes: number[],
  opts?: MakeCandlesOpts,
): Candle[] {
  return closes.map((c, i) => ({
    symbol: (opts?.symbol ?? 'XAUUSD') as Candle['symbol'],
    tf: (opts?.tf ?? '1h') as Candle['tf'],
    t: BASE_TS + i * 3_600_000,
    o: c,
    h: opts?.highs?.[i] ?? c + 1,
    l: opts?.lows?.[i] ?? c - 1,
    c,
    v: null,
    source: opts?.source ?? 'test',
    fetchedAt: 0,
  }));
}

export function makeTicks(
  prices: number[],
  opts?: { symbol?: string; source?: string },
): Tick[] {
  return prices.map((p, i) => ({
    symbol: (opts?.symbol ?? 'XAUUSD') as Tick['symbol'],
    bid: p - 0.1,
    ask: p + 0.1,
    mid: p,
    ts: BASE_TS + i * 1_000,
    source: opts?.source ?? 'test',
  }));
}
