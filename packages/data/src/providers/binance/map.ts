import type { Timeframe } from '@hamafx/shared';

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

const CRYPTO_SUFFIXES = ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC'];

export function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return CRYPTO_SUFFIXES.some((suffix) => s.endsWith(suffix));
}
