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

// Expanded crypto symbol set — covers all BUILTIN_SYMBOLS crypto entries
// plus common additional pairs.
const CRYPTO_SYMBOLS = new Set([
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'MATICUSDT',
]);

export function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return CRYPTO_SYMBOLS.has(s) || s.endsWith('USDT') || s.endsWith('BTC');
}
