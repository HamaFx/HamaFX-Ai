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

// Symbol system — now powered by the symbol catalog (symbol-catalog.ts).
// The old 3-symbol hardcoded list has been replaced with a dynamic,
// category-based system supporting 50+ symbols across gold, forex, and crypto.
//
// Backward compatibility: SYMBOLS, isSymbol, pipSize, priceDecimals, and
// formatPips are preserved but now delegate to the catalog where possible.

import { z } from 'zod';

import {
  SYMBOL_MAP,
  isKnownSymbol,
} from './symbol-catalog';

export type { SymbolCategory, SymbolDefinition } from './symbol-catalog';
export {
  BUILTIN_SYMBOLS,
  SYMBOL_MAP,
  isKnownSymbol,
  getSymbolDefinition,
  tryGetSymbolDefinition,
  ALL_SYMBOLS,
  symbolsByCategory,
  symbolCategory,
} from './symbol-catalog';

/** Legacy export — the original 3 symbols, still supported. */
export const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD'] as const;
export type Symbol = string;

/**
 * Strict symbol schema — validates against the known symbol catalog.
 * Use this for routes that should only accept supported symbols.
 */
export const SymbolSchema = z
  .string()
  .min(2)
  .max(20)
  .refine((s) => isKnownSymbol(s), (s) => ({ message: `Unknown symbol: ${s}` }));

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

/** Standard pip size per symbol — delegates to SymbolDefinition. */
export function pipSize(symbol: string): number {
  const def = SYMBOL_MAP.get(symbol.toUpperCase());
  if (def) return def.pipSize;
  // Fallback for unknown symbols
  const s = symbol.toUpperCase();
  if (s.endsWith('JPY')) return 0.01;
  return 0.0001;
}

/** Number of price decimals to show — delegates to SymbolDefinition. */
export function priceDecimals(symbol: string): number {
  const def = SYMBOL_MAP.get(symbol.toUpperCase());
  if (def) return def.decimals;
  // Fallback for unknown symbols
  const s = symbol.toUpperCase();
  if (s.endsWith('JPY')) return 3;
  return 5;
}

/** Format a price delta as a signed pip count, e.g. "-12.4 pips". */
export function formatPips(symbol: string, delta: number): string {
  const pips = delta / pipSize(symbol);
  const sign = pips > 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)} pips`;
}

/** Currency tags used for news/calendar filtering — expanded from catalog. */
export const CURRENCY_TAGS = [
  'USD', 'EUR', 'GBP', 'XAU', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF',
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA',
] as const;
export type CurrencyTag = (typeof CURRENCY_TAGS)[number];
export const CurrencyTagSchema = z.enum(CURRENCY_TAGS);
