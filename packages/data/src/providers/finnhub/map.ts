/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
  if (TO_FINNHUB_SYMBOL[symbol]) return TO_FINNHUB_SYMBOL[symbol];
  if (symbol.length === 6 && !symbol.includes(':')) {
    return `OANDA:${symbol.slice(0, 3)}_${symbol.slice(3)}`;
  }
  return symbol;
}

export function toFinnhubResolution(tf: Timeframe): string {
  return TO_FINNHUB_RESOLUTION[tf];
}
