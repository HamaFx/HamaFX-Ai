// Schema validation tests for the BiQuote wire-format schemas and the
// internal LiveTick persistence schema. Pure-zod tests — no IO, no mocks.

import { describe, expect, it } from 'vitest';

import {
  BiquoteOhlcBarSchema,
  BiquoteSymbolSchema,
  BiquoteTickSchema,
  BiquoteTimeframeSchema,
  LiveTickSchema,
} from '../src';

describe('BiquoteTickSchema', () => {
  // Real-world REST shape. Note `last: 0` for FX, dot-separated `time`,
  // free-form `source`, ISO `timestamp`, and the extras BiQuote forwards.
  const valid = {
    symbol: 'EURUSD',
    bid: 1.16285,
    ask: 1.16291,
    mid: 1.16288,
    last: 0,
    volume: 0,
    timestamp: '2026-05-27T22:09:20Z',
    source: 'MetaTrader 5 (Broker 1)',
    high: 1.16612,
    low: 1.1622,
    direction: 'FLAT',
    dayDiffPercent: 0.2275,
    description: 'Euro vs US Dollar',
    time: '2026.05.27 22:09:20',
    spread: 6e-5,
  };

  it('accepts the live REST happy path', () => {
    expect(() => BiquoteTickSchema.parse(valid)).not.toThrow();
  });

  it('accepts numeric direction (older shape)', () => {
    expect(() => BiquoteTickSchema.parse({ ...valid, direction: 1 })).not.toThrow();
    expect(() => BiquoteTickSchema.parse({ ...valid, direction: null })).not.toThrow();
  });

  it('treats description as optional / nullable', () => {
    const parsed = BiquoteTickSchema.parse({ ...valid, description: null });
    expect(parsed.description).toBeNull();

    const { description: _, ...withoutDescription } = valid;
    const parsedAgain = BiquoteTickSchema.parse(withoutDescription);
    expect(parsedAgain.description).toBeUndefined();
  });

  it('rejects non-finite numbers (NaN / Infinity poisoning)', () => {
    expect(() => BiquoteTickSchema.parse({ ...valid, bid: Number.NaN })).toThrow();
    expect(() => BiquoteTickSchema.parse({ ...valid, ask: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => BiquoteTickSchema.parse({ ...valid, mid: Number.NaN })).toThrow();
  });

  it('rejects empty timestamp', () => {
    expect(() => BiquoteTickSchema.parse({ ...valid, timestamp: '' })).toThrow();
  });

  it('rejects empty source', () => {
    expect(() => BiquoteTickSchema.parse({ ...valid, source: '' })).toThrow();
  });
});

describe('BiquoteOhlcBarSchema', () => {
  const valid = {
    openTime: '2026-05-27T18:35:00Z',
    open: 2390.0,
    high: 2390.5,
    low: 2389.8,
    close: 2390.22,
    volume: 0,
    tickVolume: 47,
    isOpen: false,
  };

  it('accepts the documented happy path', () => {
    expect(() => BiquoteOhlcBarSchema.parse(valid)).not.toThrow();
  });

  it('accepts the live unfinished bar with isOpen=true', () => {
    const parsed = BiquoteOhlcBarSchema.parse({ ...valid, isOpen: true });
    expect(parsed.isOpen).toBe(true);
  });

  it('rejects negative tick or volume counts', () => {
    expect(() => BiquoteOhlcBarSchema.parse({ ...valid, tickVolume: -1 })).toThrow();
    expect(() => BiquoteOhlcBarSchema.parse({ ...valid, volume: -1 })).toThrow();
  });

  it('rejects non-integer tickVolume', () => {
    expect(() => BiquoteOhlcBarSchema.parse({ ...valid, tickVolume: 1.5 })).toThrow();
  });

  it('rejects non-finite OHLC values', () => {
    expect(() => BiquoteOhlcBarSchema.parse({ ...valid, high: Number.NaN })).toThrow();
  });
});

describe('BiquoteSymbolSchema', () => {
  it('accepts a typical Forex entry', () => {
    expect(() =>
      BiquoteSymbolSchema.parse({
        name: 'EURUSD',
        description: 'Euro vs US Dollar',
        type: 'Forex',
        exchange: 'Forex',
        source: 'MT5',
      }),
    ).not.toThrow();
  });

  it('rejects empty fields (BiQuote always populates these)', () => {
    expect(() =>
      BiquoteSymbolSchema.parse({
        name: '',
        description: 'x',
        type: 'Forex',
        exchange: 'Forex',
        source: 'MT5',
      }),
    ).toThrow();
  });
});

describe('BiquoteTimeframeSchema', () => {
  it('accepts every documented timeframe', () => {
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const) {
      expect(() => BiquoteTimeframeSchema.parse(tf)).not.toThrow();
    }
  });

  it('rejects timeframes BiQuote does not document (e.g. weekly)', () => {
    expect(() => BiquoteTimeframeSchema.parse('1w')).toThrow();
    expect(() => BiquoteTimeframeSchema.parse('M1')).toThrow(); // wrong case
  });
});

describe('LiveTickSchema', () => {
  const valid = {
    symbol: 'XAUUSD',
    bid: 2390.12,
    ask: 2390.32,
    mid: 2390.22,
    ts: 1748378101000,
    source: 'biquote-signalr',
  };

  it('accepts the SignalR happy path', () => {
    expect(() => LiveTickSchema.parse(valid)).not.toThrow();
  });

  it('accepts the REST and Finnhub fallback sources (open string, by design)', () => {
    expect(() => LiveTickSchema.parse({ ...valid, source: 'biquote-rest' })).not.toThrow();
    expect(() => LiveTickSchema.parse({ ...valid, source: 'finnhub-rest' })).not.toThrow();
    expect(() => LiveTickSchema.parse({ ...valid, source: 'alpha-vantage' })).not.toThrow();
  });

  it('rejects symbols outside the supported set (single-currency-app guard)', () => {
    expect(() => LiveTickSchema.parse({ ...valid, symbol: 'USDJPY' })).toThrow();
    expect(() => LiveTickSchema.parse({ ...valid, symbol: 'BTCUSD' })).toThrow();
  });

  it('rejects negative timestamps', () => {
    expect(() => LiveTickSchema.parse({ ...valid, ts: -1 })).toThrow();
  });

  it('rejects empty source', () => {
    expect(() => LiveTickSchema.parse({ ...valid, source: '' })).toThrow();
  });

  it('rejects non-finite price components', () => {
    expect(() => LiveTickSchema.parse({ ...valid, mid: Number.NaN })).toThrow();
    expect(() => LiveTickSchema.parse({ ...valid, ask: Number.POSITIVE_INFINITY })).toThrow();
  });
});
