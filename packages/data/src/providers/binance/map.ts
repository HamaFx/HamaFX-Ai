import { tryGetSymbolDefinition, type Timeframe } from '@kestrel/shared';

const TO_BINANCE_INTERVAL: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

export function toBinanceInterval(tf: Timeframe): string {
  return TO_BINANCE_INTERVAL[tf];
}

/**
 * Binance eligibility comes exclusively from the shared catalog. This keeps
 * unsupported aliases and unlisted exchange pairs out of the data boundary.
 */
export function isCryptoSymbol(symbol: string): boolean {
  const definition = tryGetSymbolDefinition(symbol.trim().toUpperCase());
  return definition?.category === 'crypto' && definition.binance !== null;
}
