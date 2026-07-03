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

// Symbol catalog — the single source of truth for all supported instruments.
//
// Each SymbolDefinition carries the provider-specific format strings so the
// data layer can route requests without ad-hoc switch statements. The
// built-in list covers gold, major + cross forex, and popular crypto pairs.
//
// The DB `symbol_catalog` table mirrors this for runtime extensibility —
// users can eventually add symbols not in BUILTIN_SYMBOLS via the DB.

export type SymbolCategory = 'gold' | 'forex' | 'crypto';

export interface SymbolDefinition {
  /** Internal canonical symbol, e.g. "XAUUSD", "EURUSD", "BTCUSDT" */
  internal: string;
  /** Display name */
  display: string;
  /** Category */
  category: SymbolCategory;
  /** Twelve Data symbol format, e.g. "XAU/USD", "EUR/USD", "BTC/USD" */
  twelveData: string;
  /** BiQuote symbol format (usually same as internal) */
  biquote: string;
  /** Binance symbol format, e.g. "BTCUSDT" (null for non-crypto) */
  binance: string | null;
  /** Finnhub symbol format (for fallback) */
  finnhub: string;
  /** TradingView symbol format */
  tradingView: string;
  /** Price decimals */
  decimals: number;
  /** Pip size */
  pipSize: number;
  /** Currency tags for news/calendar filtering */
  currencies: string[];
}

/** Built-in symbols always available without DB lookup */
export const BUILTIN_SYMBOLS: SymbolDefinition[] = [
  // Gold
  { internal: 'XAUUSD', display: 'Gold / US Dollar', category: 'gold',
    twelveData: 'XAU/USD', biquote: 'XAUUSD', binance: null,
    finnhub: 'OANDA:XAU_USD', tradingView: 'OANDA:XAUUSD',
    decimals: 2, pipSize: 0.1, currencies: ['USD', 'XAU'] },

  // Major Forex
  { internal: 'EURUSD', display: 'Euro / US Dollar', category: 'forex',
    twelveData: 'EUR/USD', biquote: 'EURUSD', binance: null,
    finnhub: 'OANDA:EUR_USD', tradingView: 'OANDA:EURUSD',
    decimals: 5, pipSize: 0.0001, currencies: ['USD', 'EUR'] },
  { internal: 'GBPUSD', display: 'British Pound / US Dollar', category: 'forex',
    twelveData: 'GBP/USD', biquote: 'GBPUSD', binance: null,
    finnhub: 'OANDA:GBP_USD', tradingView: 'OANDA:GBPUSD',
    decimals: 5, pipSize: 0.0001, currencies: ['USD', 'GBP'] },
  { internal: 'USDJPY', display: 'US Dollar / Japanese Yen', category: 'forex',
    twelveData: 'USD/JPY', biquote: 'USDJPY', binance: null,
    finnhub: 'OANDA:USD_JPY', tradingView: 'OANDA:USDJPY',
    decimals: 3, pipSize: 0.01, currencies: ['USD', 'JPY'] },
  { internal: 'AUDUSD', display: 'Australian Dollar / US Dollar', category: 'forex',
    twelveData: 'AUD/USD', biquote: 'AUDUSD', binance: null,
    finnhub: 'OANDA:AUD_USD', tradingView: 'OANDA:AUDUSD',
    decimals: 5, pipSize: 0.0001, currencies: ['USD', 'AUD'] },
  { internal: 'USDCAD', display: 'US Dollar / Canadian Dollar', category: 'forex',
    twelveData: 'USD/CAD', biquote: 'USDCAD', binance: null,
    finnhub: 'OANDA:USD_CAD', tradingView: 'OANDA:USDCAD',
    decimals: 5, pipSize: 0.0001, currencies: ['USD', 'CAD'] },
  { internal: 'NZDUSD', display: 'NZ Dollar / US Dollar', category: 'forex',
    twelveData: 'NZD/USD', biquote: 'NZDUSD', binance: null,
    finnhub: 'OANDA:NZD_USD', tradingView: 'OANDA:NZDUSD',
    decimals: 5, pipSize: 0.0001, currencies: ['USD', 'NZD'] },
  { internal: 'USDCHF', display: 'US Dollar / Swiss Franc', category: 'forex',
    twelveData: 'USD/CHF', biquote: 'USDCHF', binance: null,
    finnhub: 'OANDA:USD_CHF', tradingView: 'OANDA:USDCHF',
    decimals: 5, pipSize: 0.0001, currencies: ['USD', 'CHF'] },

  // Cross pairs
  { internal: 'EURGBP', display: 'Euro / British Pound', category: 'forex',
    twelveData: 'EUR/GBP', biquote: 'EURGBP', binance: null,
    finnhub: 'OANDA:EUR_GBP', tradingView: 'OANDA:EURGBP',
    decimals: 5, pipSize: 0.0001, currencies: ['EUR', 'GBP'] },
  { internal: 'EURJPY', display: 'Euro / Japanese Yen', category: 'forex',
    twelveData: 'EUR/JPY', biquote: 'EURJPY', binance: null,
    finnhub: 'OANDA:EUR_JPY', tradingView: 'OANDA:EURJPY',
    decimals: 3, pipSize: 0.01, currencies: ['EUR', 'JPY'] },
  { internal: 'GBPJPY', display: 'British Pound / Japanese Yen', category: 'forex',
    twelveData: 'GBP/JPY', biquote: 'GBPJPY', binance: null,
    finnhub: 'OANDA:GBP_JPY', tradingView: 'OANDA:GBPJPY',
    decimals: 3, pipSize: 0.01, currencies: ['GBP', 'JPY'] },
  { internal: 'AUDJPY', display: 'Australian Dollar / Japanese Yen', category: 'forex',
    twelveData: 'AUD/JPY', biquote: 'AUDJPY', binance: null,
    finnhub: 'OANDA:AUD_JPY', tradingView: 'OANDA:AUDJPY',
    decimals: 3, pipSize: 0.01, currencies: ['AUD', 'JPY'] },

  // Crypto
  { internal: 'BTCUSDT', display: 'Bitcoin / Tether', category: 'crypto',
    twelveData: 'BTC/USD', biquote: 'BTCUSD', binance: 'BTCUSDT',
    finnhub: 'BINANCE:BTCUSDT', tradingView: 'BINANCE:BTCUSDT',
    decimals: 2, pipSize: 0.01, currencies: ['USD', 'BTC'] },
  { internal: 'ETHUSDT', display: 'Ethereum / Tether', category: 'crypto',
    twelveData: 'ETH/USD', biquote: 'ETHUSD', binance: 'ETHUSDT',
    finnhub: 'BINANCE:ETHUSDT', tradingView: 'BINANCE:ETHUSDT',
    decimals: 2, pipSize: 0.01, currencies: ['USD', 'ETH'] },
  { internal: 'SOLUSDT', display: 'Solana / Tether', category: 'crypto',
    twelveData: 'SOL/USD', biquote: 'SOLUSD', binance: 'SOLUSDT',
    finnhub: 'BINANCE:SOLUSDT', tradingView: 'BINANCE:SOLUSDT',
    decimals: 2, pipSize: 0.01, currencies: ['USD', 'SOL'] },
  { internal: 'BNBUSDT', display: 'BNB / Tether', category: 'crypto',
    twelveData: 'BNB/USD', biquote: 'BNBUSD', binance: 'BNBUSDT',
    finnhub: 'BINANCE:BNBUSDT', tradingView: 'BINANCE:BNBUSDT',
    decimals: 2, pipSize: 0.01, currencies: ['USD', 'BNB'] },
  { internal: 'XRPUSDT', display: 'Ripple / Tether', category: 'crypto',
    twelveData: 'XRP/USD', biquote: 'XRPUSD', binance: 'XRPUSDT',
    finnhub: 'BINANCE:XRPUSDT', tradingView: 'BINANCE:XRPUSDT',
    decimals: 4, pipSize: 0.0001, currencies: ['USD', 'XRP'] },
  { internal: 'ADAUSDT', display: 'Cardano / Tether', category: 'crypto',
    twelveData: 'ADA/USD', biquote: 'ADAUSD', binance: 'ADAUSDT',
    finnhub: 'BINANCE:ADAUSDT', tradingView: 'BINANCE:ADAUSDT',
    decimals: 4, pipSize: 0.0001, currencies: ['USD', 'ADA'] },
];

/** Quick lookup map */
export const SYMBOL_MAP = new Map(BUILTIN_SYMBOLS.map(s => [s.internal, s]));

/** Check if a string is a known symbol */
export function isKnownSymbol(s: string): boolean {
  return SYMBOL_MAP.has(s);
}

/** Get symbol definition or throw */
export function getSymbolDefinition(s: string): SymbolDefinition {
  const def = SYMBOL_MAP.get(s);
  if (!def) throw new Error(`Unknown symbol: ${s}`);
  return def;
}

/** Get symbol definition or null (no throw) */
export function tryGetSymbolDefinition(s: string): SymbolDefinition | null {
  return SYMBOL_MAP.get(s) ?? null;
}

/** Get all internal symbols */
export const ALL_SYMBOLS = BUILTIN_SYMBOLS.map(s => s.internal);

/** Get symbols by category */
export function symbolsByCategory(cat: SymbolCategory): string[] {
  return BUILTIN_SYMBOLS.filter(s => s.category === cat).map(s => s.internal);
}

/** Category for a symbol */
export function symbolCategory(s: string): SymbolCategory | null {
  return SYMBOL_MAP.get(s)?.category ?? null;
}
