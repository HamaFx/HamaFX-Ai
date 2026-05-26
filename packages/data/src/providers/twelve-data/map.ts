// Twelve Data ↔ internal mapping. The ONLY place these strings appear.
// Reference: https://twelvedata.com/docs#instruments

import type { Symbol, Timeframe } from '@hamafx/shared';

const TO_TWELVE_DATA_SYMBOL: Record<Symbol, string> = {
  XAUUSD: 'XAU/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
};

const TO_TWELVE_DATA_INTERVAL: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
  '1w': '1week',
};

export function toTwelveDataSymbol(symbol: Symbol): string {
  return TO_TWELVE_DATA_SYMBOL[symbol];
}

export function toTwelveDataInterval(tf: Timeframe): string {
  return TO_TWELVE_DATA_INTERVAL[tf];
}

/**
 * Twelve Data emits ISO-like timestamps in EST/UTC depending on endpoint;
 * the FX/crypto endpoints return UTC datetime strings of shape
 * "YYYY-MM-DD HH:mm:ss" (no zone). We treat them as UTC.
 */
export function parseTwelveDataDate(s: string): number {
  // Replace space with T and append Z so JS parses as UTC.
  const isoLike = s.includes('T') ? s : s.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoLike) ? isoLike : `${isoLike}Z`;
  const t = Date.parse(withZone);
  if (Number.isNaN(t)) throw new Error(`twelve-data: cannot parse datetime "${s}"`);
  return t;
}
