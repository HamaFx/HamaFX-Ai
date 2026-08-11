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

// Symbol catalog — the single source of truth for the 18 instruments that
// are supported by the first-class gold, forex, and crypto product surface.
//
// The database `symbol_catalog` table mirrors this metadata for activation,
// ordering, and user visibility. It does not define new instrument metadata;
// runtime-extensible symbols can be added in a later, explicit migration.

export type SymbolCategory = 'gold' | 'forex' | 'crypto';
export type SymbolDataProvider = 'biquote' | 'binance' | 'finnhub';
export type SymbolQuantityUnit = 'lots' | 'ounces' | 'coins';
export type SymbolPriceDistanceUnit = 'pips' | 'price';
export type SymbolSettlementCurrency = 'USD' | 'USDT';
/** @deprecated Use SymbolSettlementCurrency. */
export type SymbolQuoteCurrency = SymbolSettlementCurrency;

export interface SymbolCapabilities {
  /** Position sizing unit used by risk calculations. */
  readonly quantityUnit: SymbolQuantityUnit;
  /** Units represented by one standard lot, or one coin for crypto. */
  readonly contractSize: number;
  /** Whether price distances should be presented as pips or raw price. */
  readonly priceDistanceUnit: SymbolPriceDistanceUnit;
  /** Whether the CFTC Commitment-of-Traders pipeline applies. */
  readonly supportsCftc: boolean;
  /** Whether the economic-calendar pipeline has direct symbol relevance. */
  readonly supportsEconomicCalendar: boolean;
  /** Whether the current intermarket feature set applies. */
  readonly supportsIntermarket: boolean;
  /** Whether social/news sentiment is meaningful for the instrument. */
  readonly supportsSocialSentiment: boolean;
}

export interface SymbolDefinition {
  /** Internal canonical symbol, e.g. "XAUUSD", "EURUSD", "BTCUSDT" */
  readonly internal: string;
  /** Display name */
  readonly display: string;
  /** Asset category */
  readonly category: SymbolCategory;
  /** Base asset/currency */
  readonly baseCurrency: string;
  /** Quote currency (e.g. JPY for USDJPY, USDT for crypto). */
  readonly quoteCurrency: string;
  /** Settlement currency used for account/risk display. */
  readonly settlementCurrency: SymbolSettlementCurrency;
  /** BiQuote symbol format, or null when BiQuote is not applicable. */
  readonly biquote: string | null;
  /** Binance symbol format, or null for non-crypto instruments. */
  readonly binance: string | null;
  /** Finnhub symbol format (for fallback). */
  readonly finnhub: string;
  /** TradingView symbol format. */
  readonly tradingView: string;
  /** Price decimals. */
  readonly decimals: number;
  /** Legacy pip/price-step field retained for formatting compatibility. */
  readonly pipSize: number;
  /** Currency/asset tags used for news filtering. */
  readonly currencies: readonly string[];
  /** Upstream providers that can serve this instrument. */
  readonly providers: readonly SymbolDataProvider[];
  /** Asset-specific behavior used by later phases. */
  readonly capabilities: SymbolCapabilities;
}

const FX_CAPABILITIES: SymbolCapabilities = {
  quantityUnit: 'lots',
  contractSize: 100_000,
  priceDistanceUnit: 'pips',
  supportsCftc: false,
  supportsEconomicCalendar: true,
  supportsIntermarket: true,
  supportsSocialSentiment: true,
};

const CFTC_FX_CAPABILITIES: SymbolCapabilities = {
  ...FX_CAPABILITIES,
  supportsCftc: true,
};

const GOLD_CAPABILITIES: SymbolCapabilities = {
  quantityUnit: 'ounces',
  contractSize: 100,
  priceDistanceUnit: 'pips',
  supportsCftc: true,
  supportsEconomicCalendar: true,
  supportsIntermarket: true,
  supportsSocialSentiment: true,
};

const CRYPTO_CAPABILITIES: SymbolCapabilities = {
  quantityUnit: 'coins',
  contractSize: 1,
  priceDistanceUnit: 'price',
  supportsCftc: false,
  supportsEconomicCalendar: false,
  supportsIntermarket: false,
  supportsSocialSentiment: true,
};

/** Built-in symbols always available without a database lookup. */
const BUILTIN_SYMBOLS_UNFROZEN: SymbolDefinition[] = [
  // Gold
  {
    internal: 'XAUUSD',
    display: 'Gold / US Dollar',
    category: 'gold',
    baseCurrency: 'XAU',
    quoteCurrency: 'USD',
    settlementCurrency: 'USD',
    biquote: 'XAUUSD',
    binance: null,
    finnhub: 'OANDA:XAU_USD',
    tradingView: 'OANDA:XAUUSD',
    decimals: 2,
    pipSize: 0.1,
    currencies: ['USD', 'XAU'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...GOLD_CAPABILITIES },
  },

  // Major Forex
  {
    internal: 'EURUSD',
    display: 'Euro / US Dollar',
    category: 'forex',
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    settlementCurrency: 'USD',
    biquote: 'EURUSD',
    binance: null,
    finnhub: 'OANDA:EUR_USD',
    tradingView: 'OANDA:EURUSD',
    decimals: 5,
    pipSize: 0.0001,
    currencies: ['USD', 'EUR'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...CFTC_FX_CAPABILITIES },
  },
  {
    internal: 'GBPUSD',
    display: 'British Pound / US Dollar',
    category: 'forex',
    baseCurrency: 'GBP',
    quoteCurrency: 'USD',
    settlementCurrency: 'USD',
    biquote: 'GBPUSD',
    binance: null,
    finnhub: 'OANDA:GBP_USD',
    tradingView: 'OANDA:GBPUSD',
    decimals: 5,
    pipSize: 0.0001,
    currencies: ['USD', 'GBP'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...CFTC_FX_CAPABILITIES },
  },
  {
    internal: 'USDJPY',
    display: 'US Dollar / Japanese Yen',
    category: 'forex',
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    settlementCurrency: 'USD',
    biquote: 'USDJPY',
    binance: null,
    finnhub: 'OANDA:USD_JPY',
    tradingView: 'OANDA:USDJPY',
    decimals: 3,
    pipSize: 0.01,
    currencies: ['USD', 'JPY'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },
  {
    internal: 'AUDUSD',
    display: 'Australian Dollar / US Dollar',
    category: 'forex',
    baseCurrency: 'AUD',
    quoteCurrency: 'USD',
    settlementCurrency: 'USD',
    biquote: 'AUDUSD',
    binance: null,
    finnhub: 'OANDA:AUD_USD',
    tradingView: 'OANDA:AUDUSD',
    decimals: 5,
    pipSize: 0.0001,
    currencies: ['USD', 'AUD'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },
  {
    internal: 'USDCAD',
    display: 'US Dollar / Canadian Dollar',
    category: 'forex',
    baseCurrency: 'USD',
    quoteCurrency: 'CAD',
    settlementCurrency: 'USD',
    biquote: 'USDCAD',
    binance: null,
    finnhub: 'OANDA:USD_CAD',
    tradingView: 'OANDA:USDCAD',
    decimals: 5,
    pipSize: 0.0001,
    currencies: ['USD', 'CAD'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },
  {
    internal: 'NZDUSD',
    display: 'New Zealand Dollar / US Dollar',
    category: 'forex',
    baseCurrency: 'NZD',
    quoteCurrency: 'USD',
    settlementCurrency: 'USD',
    biquote: 'NZDUSD',
    binance: null,
    finnhub: 'OANDA:NZD_USD',
    tradingView: 'OANDA:NZDUSD',
    decimals: 5,
    pipSize: 0.0001,
    currencies: ['USD', 'NZD'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },
  {
    internal: 'USDCHF',
    display: 'US Dollar / Swiss Franc',
    category: 'forex',
    baseCurrency: 'USD',
    quoteCurrency: 'CHF',
    settlementCurrency: 'USD',
    biquote: 'USDCHF',
    binance: null,
    finnhub: 'OANDA:USD_CHF',
    tradingView: 'OANDA:USDCHF',
    decimals: 5,
    pipSize: 0.0001,
    currencies: ['USD', 'CHF'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },

  // Cross pairs
  {
    internal: 'EURGBP',
    display: 'Euro / British Pound',
    category: 'forex',
    baseCurrency: 'EUR',
    quoteCurrency: 'GBP',
    settlementCurrency: 'USD',
    biquote: 'EURGBP',
    binance: null,
    finnhub: 'OANDA:EUR_GBP',
    tradingView: 'OANDA:EURGBP',
    decimals: 5,
    pipSize: 0.0001,
    currencies: ['EUR', 'GBP'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },
  {
    internal: 'EURJPY',
    display: 'Euro / Japanese Yen',
    category: 'forex',
    baseCurrency: 'EUR',
    quoteCurrency: 'JPY',
    settlementCurrency: 'USD',
    biquote: 'EURJPY',
    binance: null,
    finnhub: 'OANDA:EUR_JPY',
    tradingView: 'OANDA:EURJPY',
    decimals: 3,
    pipSize: 0.01,
    currencies: ['EUR', 'JPY'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },
  {
    internal: 'GBPJPY',
    display: 'British Pound / Japanese Yen',
    category: 'forex',
    baseCurrency: 'GBP',
    quoteCurrency: 'JPY',
    settlementCurrency: 'USD',
    biquote: 'GBPJPY',
    binance: null,
    finnhub: 'OANDA:GBP_JPY',
    tradingView: 'OANDA:GBPJPY',
    decimals: 3,
    pipSize: 0.01,
    currencies: ['GBP', 'JPY'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },
  {
    internal: 'AUDJPY',
    display: 'Australian Dollar / Japanese Yen',
    category: 'forex',
    baseCurrency: 'AUD',
    quoteCurrency: 'JPY',
    settlementCurrency: 'USD',
    biquote: 'AUDJPY',
    binance: null,
    finnhub: 'OANDA:AUD_JPY',
    tradingView: 'OANDA:AUDJPY',
    decimals: 3,
    pipSize: 0.01,
    currencies: ['AUD', 'JPY'],
    providers: ['biquote', 'finnhub'],
    capabilities: { ...FX_CAPABILITIES },
  },

  // Crypto — canonical identity is always the USDT pair.
  {
    internal: 'BTCUSDT',
    display: 'Bitcoin / Tether',
    category: 'crypto',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'BTCUSDT',
    finnhub: 'BINANCE:BTCUSDT',
    tradingView: 'BINANCE:BTCUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'BTC'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'ETHUSDT',
    display: 'Ethereum / Tether',
    category: 'crypto',
    baseCurrency: 'ETH',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'ETHUSDT',
    finnhub: 'BINANCE:ETHUSDT',
    tradingView: 'BINANCE:ETHUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'ETH'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'SOLUSDT',
    display: 'Solana / Tether',
    category: 'crypto',
    baseCurrency: 'SOL',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'SOLUSDT',
    finnhub: 'BINANCE:SOLUSDT',
    tradingView: 'BINANCE:SOLUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'SOL'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'BNBUSDT',
    display: 'BNB / Tether',
    category: 'crypto',
    baseCurrency: 'BNB',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'BNBUSDT',
    finnhub: 'BINANCE:BNBUSDT',
    tradingView: 'BINANCE:BNBUSDT',
    decimals: 2,
    pipSize: 0.01,
    currencies: ['USD', 'USDT', 'BNB'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'XRPUSDT',
    display: 'XRP / Tether',
    category: 'crypto',
    baseCurrency: 'XRP',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'XRPUSDT',
    finnhub: 'BINANCE:XRPUSDT',
    tradingView: 'BINANCE:XRPUSDT',
    decimals: 4,
    pipSize: 0.0001,
    currencies: ['USD', 'USDT', 'XRP'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
  {
    internal: 'ADAUSDT',
    display: 'Cardano / Tether',
    category: 'crypto',
    baseCurrency: 'ADA',
    quoteCurrency: 'USDT',
    settlementCurrency: 'USDT',
    biquote: null,
    binance: 'ADAUSDT',
    finnhub: 'BINANCE:ADAUSDT',
    tradingView: 'BINANCE:ADAUSDT',
    decimals: 4,
    pipSize: 0.0001,
    currencies: ['USD', 'USDT', 'ADA'],
    providers: ['binance', 'finnhub'],
    capabilities: { ...CRYPTO_CAPABILITIES },
  },
];

function freezeSymbolDefinition(definition: SymbolDefinition): SymbolDefinition {
  Object.freeze(definition.capabilities);
  Object.freeze(definition.currencies);
  Object.freeze(definition.providers);
  return Object.freeze(definition);
}

/** Immutable built-in catalog exposed to all package consumers. */
export const BUILTIN_SYMBOLS: readonly SymbolDefinition[] = Object.freeze(
  BUILTIN_SYMBOLS_UNFROZEN.map(freezeSymbolDefinition),
);

/**
 * Read-only Map-compatible lookup surface. The backing map remains a real
 * Map for `instanceof Map` and iteration compatibility, while public mutators
 * throw instead of changing global catalog state.
 */
const SYMBOL_MAP_BACKING = new Map(BUILTIN_SYMBOLS.map((symbol) => [symbol.internal, symbol]));
const readOnlyMapMutation = (): never => {
  throw new Error('The canonical symbol map is read-only');
};

export const SYMBOL_MAP: ReadonlyMap<string, SymbolDefinition> = new Proxy(SYMBOL_MAP_BACKING, {
  get(target, property, _receiver) {
    if (property === 'set' || property === 'delete' || property === 'clear') {
      return readOnlyMapMutation;
    }
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

/** Canonicalize user/provider input without accepting unsupported aliases. */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** Check if a string is a known canonical symbol. */
export function isKnownSymbol(symbol: string): boolean {
  return SYMBOL_MAP.has(normalizeSymbol(symbol));
}

/** Get a symbol definition or throw for an unsupported instrument. */
export function getSymbolDefinition(symbol: string): SymbolDefinition {
  const canonical = normalizeSymbol(symbol);
  const definition = SYMBOL_MAP.get(canonical);
  if (!definition) throw new Error(`Unknown symbol: ${canonical}`);
  return definition;
}

/** Get a symbol definition or null (no throw). */
export function tryGetSymbolDefinition(symbol: string): SymbolDefinition | null {
  return SYMBOL_MAP.get(normalizeSymbol(symbol)) ?? null;
}

/** All 18 canonical built-in symbols. */
export const ALL_SYMBOLS: readonly string[] = Object.freeze(
  BUILTIN_SYMBOLS.map((symbol) => symbol.internal),
);

/** New-user watchlist defaults: gold, major FX, and two liquid crypto pairs. */
export const DEFAULT_WATCHLIST_SYMBOLS = Object.freeze([
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'BTCUSDT',
  'ETHUSDT',
] as const);

/** Default active stream set before the database catalog is reconciled. */
export const DEFAULT_STREAM_SYMBOLS = Object.freeze([...ALL_SYMBOLS]);

/** Symbols with a direct CFTC Commitment-of-Traders mapping. */
export const CFTC_SUPPORTED_SYMBOLS = Object.freeze(['XAUUSD', 'EURUSD', 'GBPUSD'] as const);

/** Validate the built-in catalog contract at module initialization and in tests. */
export function assertSymbolCatalog(): void {
  const seen = new Set<string>();
  for (const definition of BUILTIN_SYMBOLS) {
    const canonical = normalizeSymbol(definition.internal);
    if (canonical !== definition.internal || seen.has(definition.internal)) {
      throw new Error(`Invalid or duplicate canonical symbol: ${definition.internal}`);
    }
    seen.add(definition.internal);

    const hasProvider = (provider: SymbolDataProvider) => definition.providers.includes(provider);
    if (definition.category === 'crypto') {
      if (definition.binance === null || !hasProvider('binance') || definition.biquote !== null) {
        throw new Error(`Invalid crypto provider metadata: ${definition.internal}`);
      }
    } else if (definition.binance !== null || !hasProvider('biquote') || definition.biquote === null) {
      throw new Error(`Invalid non-crypto provider metadata: ${definition.internal}`);
    }

    const hasCftcMapping = CFTC_SUPPORTED_SYMBOLS.includes(
      definition.internal as (typeof CFTC_SUPPORTED_SYMBOLS)[number],
    );
    if (definition.capabilities.supportsCftc !== hasCftcMapping) {
      throw new Error(`Invalid CFTC capability metadata: ${definition.internal}`);
    }
  }

  const defaults = [...DEFAULT_WATCHLIST_SYMBOLS, ...DEFAULT_STREAM_SYMBOLS, ...CFTC_SUPPORTED_SYMBOLS];
  if (defaults.some((symbol) => !seen.has(symbol))) {
    throw new Error('Invalid symbol defaults: every default must be canonical');
  }
}

assertSymbolCatalog();

/** Get all canonical symbols in one asset category. */
export function symbolsByCategory(category: SymbolCategory): string[] {
  return BUILTIN_SYMBOLS
    .filter((symbol) => symbol.category === category)
    .map((symbol) => symbol.internal);
}

/** Category for a symbol, or null for an unsupported input. */
export function symbolCategory(symbol: string): SymbolCategory | null {
  return tryGetSymbolDefinition(symbol)?.category ?? null;
}
