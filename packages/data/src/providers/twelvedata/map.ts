import type { Timeframe } from '@hamafx/shared';

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

export function toTwelveDataSymbol(symbol: string): string {
  if (FOREX_SYMBOL_RE.test(symbol)) {
    return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  }
  return symbol;
}
