// Finnhub ↔ internal mapping. Reference: https://finnhub.io/docs/api
// FX is exposed via the OANDA forex feed: e.g. "OANDA:XAU_USD".

import type { Symbol, Timeframe } from '@hamafx/shared';

const TO_FINNHUB_SYMBOL: Record<Symbol, string> = {
  XAUUSD: 'OANDA:XAU_USD',
  EURUSD: 'OANDA:EUR_USD',
  GBPUSD: 'OANDA:GBP_USD',
};

const TO_FINNHUB_RESOLUTION: Record<Timeframe, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  // Finnhub's free FX `forex/candle` endpoint does not natively support 4h —
  // we synthesise from 1h in the adapter when needed.
  '4h': '60',
  '1d': 'D',
  '1w': 'W',
};

export function toFinnhubSymbol(symbol: Symbol): string {
  return TO_FINNHUB_SYMBOL[symbol];
}

export function toFinnhubResolution(tf: Timeframe): string {
  return TO_FINNHUB_RESOLUTION[tf];
}
