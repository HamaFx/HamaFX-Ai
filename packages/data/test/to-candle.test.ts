import { describe, expect, it } from 'vitest';
import { toCandle, toCandleFromBiquote } from '../src/providers/to-candle';

const DEFAULT_OPTS = {
  symbol: 'XAUUSD' as const,
  tf: '1h' as const,
  source: 'test',
  fetchedAt: 1_700_000_000_000,
};

describe('toCandle', () => {
  it('maps a standard bar to a Candle DTO', () => {
    const result = toCandle(
      { t: 1_700_000_000_000, o: 2000, h: 2010, l: 1995, c: 2005, v: 150 },
      DEFAULT_OPTS,
    );
    expect(result.symbol).toBe('XAUUSD');
    expect(result.tf).toBe('1h');
    expect(result.t).toBe(1_700_000_000_000);
    expect(result.o).toBe(2000);
    expect(result.h).toBe(2010);
    expect(result.l).toBe(1995);
    expect(result.c).toBe(2005);
    expect(result.v).toBe(150);
    expect(result.source).toBe('test');
    expect(result.fetchedAt).toBe(1_700_000_000_000);
  });

  it('accepts null volume', () => {
    const result = toCandle(
      { t: 1, o: 100, h: 101, l: 99, c: 100, v: null },
      DEFAULT_OPTS,
    );
    expect(result.v).toBeNull();
  });

  it('accepts different symbol and timeframe', () => {
    const result = toCandle(
      { t: 1, o: 1, h: 2, l: 1, c: 2, v: null },
      { ...DEFAULT_OPTS, symbol: 'EURUSD' as const, tf: '4h' as const },
    );
    expect(result.symbol).toBe('EURUSD');
    expect(result.tf).toBe('4h');
  });
});

describe('toCandleFromBiquote', () => {
  it('maps a BiQuote bar to a Candle DTO', () => {
    const result = toCandleFromBiquote(
      { openTime: '2025-01-15T10:00:00.000Z', open: 2000, high: 2010, low: 1995, close: 2005, volume: 0 },
      { symbol: 'XAUUSD' as const, tf: '1h' as const, fetchedAt: 1_700_000_000_000 },
    );
    expect(result.symbol).toBe('XAUUSD');
    expect(result.tf).toBe('1h');
    expect(result.t).toBe(Date.parse('2025-01-15T10:00:00.000Z'));
    expect(result.o).toBe(2000);
    expect(result.h).toBe(2010);
    expect(result.l).toBe(1995);
    expect(result.c).toBe(2005);
    // BiQuote returns 0 volume for FX — should be stored as null
    expect(result.v).toBeNull();
    expect(result.source).toBe('biquote');
  });

  it('maps positive volume when provided', () => {
    const result = toCandleFromBiquote(
      { openTime: '2025-01-15T10:00:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 500 },
      { symbol: 'EURUSD' as const, tf: '1h' as const, fetchedAt: 1 },
    );
    expect(result.v).toBe(500);
  });
});
