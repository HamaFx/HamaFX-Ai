import { describe, expect, it } from 'vitest';
import { makeCandles, makeTicks } from './candles';
import type { Candle, Tick } from '@hamafx/shared';

describe('makeCandles', () => {
  it('creates candles with default options', () => {
    const candles = makeCandles([100, 102, 101]);
    expect(candles).toHaveLength(3);
    expect(candles[0]!).toMatchObject({
      symbol: 'XAUUSD',
      tf: '1h',
      o: 100,
      c: 100,
      source: 'test',
    });
  });

  it('uses close values as open/close by default', () => {
    const [first, second] = makeCandles([50, 55]) as [Candle, Candle];
    expect(first.o).toBe(50);
    expect(first.c).toBe(50);
    expect(second.o).toBe(55);
    expect(second.c).toBe(55);
  });

  it('defaults high to close+1 and low to close-1', () => {
    const [candle] = makeCandles([200]) as [Candle];
    expect(candle.h).toBe(201);
    expect(candle.l).toBe(199);
  });

  it('accepts custom highs and lows', () => {
    const candles = makeCandles([100, 102], {
      highs: [105, 108],
      lows: [95, 99],
    });
    expect(candles[0]!.h).toBe(105);
    expect(candles[0]!.l).toBe(95);
    expect(candles[1]!.h).toBe(108);
    expect(candles[1]!.l).toBe(99);
  });

  it('accepts custom symbol, timeframe, and source', () => {
    const candles = makeCandles([100], {
      symbol: 'EURUSD',
      tf: '1d',
      source: 'binance',
    });
    expect(candles[0]!.symbol).toBe('EURUSD');
    expect(candles[0]!.tf).toBe('1d');
    expect(candles[0]!.source).toBe('binance');
  });

  it('spaces candles by 1 hour (3,600,000ms) by default', () => {
    const [a, b, c] = makeCandles([1, 2, 3]) as [Candle, Candle, Candle];
    expect(b.t - a.t).toBe(3_600_000);
    expect(c.t - b.t).toBe(3_600_000);
  });

  it('sets volume to null', () => {
    const candles = makeCandles([100]);
    expect(candles[0]!.v).toBeNull();
  });

  it('sets fetchedAt to 0', () => {
    const candles = makeCandles([100]);
    expect(candles[0]!.fetchedAt).toBe(0);
  });

  it('returns empty array for empty input', () => {
    const candles = makeCandles([]);
    expect(candles).toHaveLength(0);
  });

  it('handles single candle with minimal data', () => {
    const [candle] = makeCandles([42]) as [Candle];
    expect(candle.o).toBe(42);
    expect(candle.c).toBe(42);
    expect(candle.h).toBe(43);
    expect(candle.l).toBe(41);
    expect(candle.symbol).toBe('XAUUSD');
    expect(candle.source).toBe('test');
  });
});

describe('makeTicks', () => {
  it('creates ticks with default options', () => {
    const ticks = makeTicks([100, 101]);
    expect(ticks).toHaveLength(2);
    expect(ticks[0]!).toMatchObject({
      symbol: 'XAUUSD',
      mid: 100,
      source: 'test',
    });
  });

  it('computes bid as price-0.1 and ask as price+0.1', () => {
    const [tick] = makeTicks([1000]) as [Tick];
    expect(tick.bid).toBe(999.9);
    expect(tick.ask).toBe(1000.1);
    expect(tick.mid).toBe(1000);
  });

  it('accepts custom symbol and source', () => {
    const [tick] = makeTicks([50], { symbol: 'GBPUSD', source: 'biquote' }) as [Tick];
    expect(tick.symbol).toBe('GBPUSD');
    expect(tick.source).toBe('biquote');
  });

  it('spaces ticks by 1 second (1,000ms)', () => {
    const [a, b, c] = makeTicks([1, 2, 3]) as [Tick, Tick, Tick];
    expect(b.ts - a.ts).toBe(1_000);
    expect(c.ts - b.ts).toBe(1_000);
  });

  it('returns empty array for empty input', () => {
    const ticks = makeTicks([]);
    expect(ticks).toHaveLength(0);
  });

  it('handles negative and zero prices', () => {
    const [tick] = makeTicks([0]) as [Tick];
    expect(tick.bid).toBe(-0.1);
    expect(tick.ask).toBe(0.1);
    expect(tick.mid).toBe(0);
  });
});
