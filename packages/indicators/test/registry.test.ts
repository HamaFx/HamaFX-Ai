import { describe, expect, it } from 'vitest';
import { computeIndicator, parseIndicatorParams } from '../src/registry';
import type { Candle } from '@hamafx/shared';

function makeCandle(h: number, l: number, t: number): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t,
    o: (h + l) / 2,
    h,
    l,
    c: (h + l) / 2,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

describe('parseIndicatorParams', () => {
  it('parses valid params for "rsi" kind', () => {
    const result = parseIndicatorParams('rsi', { period: 14 });
    expect(result).toEqual({ period: 14 });
  });

  it('parses valid params for "ema" kind', () => {
    const result = parseIndicatorParams('ema', { period: 20 });
    expect(result).toEqual({ period: 20 });
  });

  it('throws for missing required params', () => {
    expect(() => parseIndicatorParams('rsi', {})).toThrow();
  });
});

describe('computeIndicator', () => {
  const candles = [
    makeCandle(101, 99, 1_700_000_000_000),
    makeCandle(102, 100, 1_700_003_600_000),
    makeCandle(103, 101, 1_700_007_200_000),
    makeCandle(104, 102, 1_700_010_800_000),
    makeCandle(105, 103, 1_700_014_400_000),
  ];

  it('computes RSI indicator', () => {
    const result = computeIndicator({
      symbol: 'XAUUSD',
      tf: '1h',
      kind: 'rsi',
      params: { period: 3 },
      candles,
    });
    expect(result.kind).toBe('rsi');
    expect(result.symbol).toBe('XAUUSD');
    expect(result.tf).toBe('1h');
    expect(result.params).toEqual({ period: 3 });
    expect(Array.isArray(result.values)).toBe(true);
    expect(result.fetchedAt).toBeGreaterThan(0);
  });

  it('computes EMA indicator', () => {
    const result = computeIndicator({
      symbol: 'EURUSD',
      tf: '1d',
      kind: 'ema',
      params: { period: 5 },
      candles,
    });
    expect(result.kind).toBe('ema');
    expect(result.symbol).toBe('EURUSD');
    expect(result.tf).toBe('1d');
    expect(Array.isArray(result.values)).toBe(true);
  });

  it('computes SMA indicator', () => {
    const result = computeIndicator({
      symbol: 'GBPUSD',
      tf: '4h',
      kind: 'sma',
      params: { period: 5 },
      candles,
    });
    expect(result.kind).toBe('sma');
    expect(Array.isArray(result.values)).toBe(true);
  });

  it('computes MACD indicator', () => {
    const result = computeIndicator({
      symbol: 'XAUUSD',
      tf: '1h',
      kind: 'macd',
      params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      candles,
    });
    expect(result.kind).toBe('macd');
    expect(Array.isArray(result.values)).toBe(true);
  });

  it('computes Bollinger Bands indicator', () => {
    const result = computeIndicator({
      symbol: 'XAUUSD',
      tf: '1h',
      kind: 'bollinger',
      params: { period: 5, stdDev: 2 },
      candles,
    });
    expect(result.kind).toBe('bollinger');
    expect(Array.isArray(result.values)).toBe(true);
  });
});
