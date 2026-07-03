import type { Timeframe } from '@hamafx/shared';
import { BUILTIN_SYMBOLS, getSymbolDefinition, isKnownSymbol } from '@hamafx/shared';

const TO_TWELVEDATA_INTERVAL: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1h',
  '4h': '4h',
  '1d': '1day',
  '1w': '1week',
};

export function toTwelveDataInterval(tf: Timeframe): string {
  return TO_TWELVEDATA_INTERVAL[tf];
}

const FOREX_SYMBOL_RE = /^[A-Z]{6}$/;

/**
 * Convert an internal symbol to Twelve Data format.
 * Uses the catalog's `twelveData` field for known symbols.
 * Falls back to inserting a slash for 6-char forex symbols.
 */
export function toTwelveDataSymbol(symbol: string): string {
  // Check catalog first
  if (isKnownSymbol(symbol)) {
    return getSymbolDefinition(symbol).twelveData;
  }
  // Fallback for unknown 6-char forex symbols: EURUSD → EUR/USD
  if (FOREX_SYMBOL_RE.test(symbol)) {
    return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  }
  return symbol;
}

/** Reverse lookup map: Twelve Data symbol → internal symbol */
const TD_TO_INTERNAL = new Map(BUILTIN_SYMBOLS.map(s => [s.twelveData, s.internal]));

/**
 * Reverse mapping: Twelve Data symbol → internal symbol.
 * Used by the WebSocket consumer to map incoming price events.
 */
export function fromTwelveDataSymbol(tdSymbol: string): string {
  const internal = TD_TO_INTERNAL.get(tdSymbol);
  if (internal) return internal;
  // Fallback: remove slashes (e.g. "EUR/USD" → "EURUSD")
  return tdSymbol.replace('/', '');
}
