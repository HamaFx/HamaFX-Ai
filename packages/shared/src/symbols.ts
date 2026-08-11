/**
 * Copyright 2026 Kestrel
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

// Symbol system — powered by the canonical symbol catalog (symbol-catalog.ts).
// The catalog currently contains 18 supported instruments across gold, forex,
// and crypto. The legacy three-symbol export remains temporarily for callers
// that are intentionally limited to the CFTC/legacy feature set.
//
// Backward compatibility: SYMBOLS, isSymbol, pipSize, priceDecimals, and
// formatPips are preserved but now delegate to the catalog where possible.

import { z } from 'zod';

import {
  SYMBOL_MAP,
  isKnownSymbol,
  normalizeSymbol,
  tryGetSymbolDefinition,
} from './symbol-catalog';

export {
  BUILTIN_SYMBOLS,
  SYMBOL_MAP,
  isKnownSymbol,
  normalizeSymbol,
  getSymbolDefinition,
  tryGetSymbolDefinition,
  DEFAULT_WATCHLIST_SYMBOLS,
  CFTC_SUPPORTED_SYMBOLS,
  symbolsByCategory,
  symbolCategory,
} from './symbol-catalog';
export type {
  SymbolCategory,
  SymbolDefinition,
  SymbolCapabilities,
  SymbolDataProvider,
  SymbolPriceDistanceUnit,
  SymbolQuantityUnit,
  SymbolQuoteCurrency,
  SymbolSettlementCurrency,
} from './symbol-catalog';

/** Legacy export — the original 3 symbols, still supported. */
export const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD'] as const;
export type Symbol = string;

/**
 * Strict symbol schema — normalizes case/whitespace and validates against
 * the known symbol catalog. Unsupported aliases are intentionally rejected.
 */
export const SymbolSchema = z
  .string()
  .min(2)
  .max(20)
  .transform(normalizeSymbol)
  .refine((symbol) => isKnownSymbol(symbol), (symbol) => ({
    message: `Unknown symbol: ${symbol}`,
  }));

/**
 * Loose symbol schema — accepts any reasonable string.
 * Use for routes that need to accept any symbol (e.g. search).
 */
export const LooseSymbolSchema = z.string().min(2).max(20);

/**
 * Type guard — checks if a value is a known symbol.
 * Replaces the old permissive length-only check.
 */
export function isSymbol(value: unknown): value is string {
  return typeof value === 'string' && isKnownSymbol(value);
}

/** Price distance step per symbol — delegates to SymbolDefinition. */
export function pipSize(symbol: string): number {
  const def = SYMBOL_MAP.get(normalizeSymbol(symbol));
  if (def) return def.pipSize;
  // Fallback for unknown symbols
  const s = normalizeSymbol(symbol);
  if (s.endsWith('JPY')) return 0.01;
  return 0.0001;
}

/** Number of price decimals to show — delegates to SymbolDefinition. */
export function priceDecimals(symbol: string): number {
  const def = SYMBOL_MAP.get(normalizeSymbol(symbol));
  if (def) return def.decimals;
  // Fallback for unknown symbols
  const s = normalizeSymbol(symbol);
  if (s.endsWith('JPY')) return 3;
  return 5;
}

/** Format a price delta using the instrument's configured distance unit. */
export function formatPips(symbol: string, delta: number): string {
  const def = tryGetSymbolDefinition(symbol);
  if (def?.capabilities.priceDistanceUnit === 'price') {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)} price units`;
  }
  const pips = delta / pipSize(symbol);
  const sign = pips > 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)} pips`;
}

/** Currency tags used for news/calendar filtering — expanded from catalog. */
export const CURRENCY_TAGS = [
  'USD', 'USDT', 'EUR', 'GBP', 'XAU', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF',
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA',
] as const;
export type CurrencyTag = (typeof CURRENCY_TAGS)[number];
export const CurrencyTagSchema = z.enum(CURRENCY_TAGS);
