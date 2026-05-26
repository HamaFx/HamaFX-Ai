import { describe, expect, it } from 'vitest';

import { detectOrderBlocks } from '../src/smc/order-blocks';
import type { Candle } from '@hamafx/shared';

function bar(i: number, o: number, h: number, l: number, c: number): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t: i * 3_600_000,
    o,
    h,
    l,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

describe('detectOrderBlocks', () => {
  it('returns empty for too-short windows', () => {
    expect(detectOrderBlocks([])).toEqual([]);
    expect(detectOrderBlocks([bar(0, 1, 1.5, 0.5, 1.2)])).toEqual([]);
  });

  it('detects a bullish OB: last red bar before two greens that close above', () => {
    // Bar 0 = red (close < open), high=2, low=0.5
    // Bar 1 = green
    // Bar 2 = green, closes above bar0.high (2.0)
    const candles = [
      bar(0, 1.8, 2.0, 0.5, 1.0), // bearish OB candidate
      bar(1, 1.0, 2.5, 1.0, 2.3), // bullish
      bar(2, 2.3, 3.5, 2.0, 3.2), // bullish, close 3.2 > 2.0
    ];
    const obs = detectOrderBlocks(candles, { impulseBars: 2 });
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ side: 'bullish', index: 0, top: 2.0, bottom: 0.5 });
  });

  it('detects a bearish OB: last green before two reds that close below', () => {
    const candles = [
      bar(0, 3.0, 5.0, 2.5, 4.5), // bullish OB candidate
      bar(1, 4.5, 4.5, 2.5, 3.0), // bearish
      bar(2, 3.0, 3.0, 1.0, 1.5), // bearish, close 1.5 < 2.5
    ];
    const obs = detectOrderBlocks(candles, { impulseBars: 2 });
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ side: 'bearish' });
  });

  it('flags mitigated when a later bar wicks back into the OB zone', () => {
    const candles = [
      bar(0, 1.8, 2.0, 0.5, 1.0),
      bar(1, 1.0, 2.5, 1.0, 2.3),
      bar(2, 2.3, 3.5, 2.0, 3.2),
      bar(3, 3.2, 3.5, 1.5, 3.0), // wick into OB zone (1.5 inside [0.5, 2.0])
    ];
    const obs = detectOrderBlocks(candles, { impulseBars: 2 });
    expect(obs[0]?.mitigated).toBe(true);
  });
});
