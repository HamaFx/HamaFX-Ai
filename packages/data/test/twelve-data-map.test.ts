import { describe, expect, it } from 'vitest';

import {
  parseTwelveDataDate,
  toTwelveDataInterval,
  toTwelveDataSymbol,
} from '../src/providers/twelve-data/map';

describe('twelve-data map', () => {
  it('maps every supported symbol', () => {
    expect(toTwelveDataSymbol('XAUUSD')).toBe('XAU/USD');
    expect(toTwelveDataSymbol('EURUSD')).toBe('EUR/USD');
    expect(toTwelveDataSymbol('GBPUSD')).toBe('GBP/USD');
  });

  it('maps every supported timeframe', () => {
    expect(toTwelveDataInterval('1m')).toBe('1min');
    expect(toTwelveDataInterval('5m')).toBe('5min');
    expect(toTwelveDataInterval('15m')).toBe('15min');
    expect(toTwelveDataInterval('30m')).toBe('30min');
    expect(toTwelveDataInterval('1h')).toBe('1h');
    expect(toTwelveDataInterval('4h')).toBe('4h');
    expect(toTwelveDataInterval('1d')).toBe('1day');
    expect(toTwelveDataInterval('1w')).toBe('1week');
  });

  it('parses Twelve Data datetime as UTC', () => {
    // Space-separated, no timezone (Twelve Data's typical FX shape).
    expect(parseTwelveDataDate('2026-05-26 14:30:00')).toBe(Date.UTC(2026, 4, 26, 14, 30, 0));
    // ISO with Z.
    expect(parseTwelveDataDate('2026-05-26T14:30:00Z')).toBe(Date.UTC(2026, 4, 26, 14, 30, 0));
  });

  it('throws on unparseable datetime', () => {
    expect(() => parseTwelveDataDate('not-a-date')).toThrow(/cannot parse datetime/);
  });
});
