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

// The three supported instruments. This list is INTENTIONALLY tiny — see
// docs/00-overview.md and docs/14-ai-agent-handoff.md. Adding a symbol here
// is a project-wide change that touches data adapters, agent prompts, and UI.

import { z } from 'zod';

export const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD'] as const;
export type Symbol = string;

export const SymbolSchema = z.string().min(2).max(20);

export function isSymbol(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 2 && value.length <= 20;
}

/** Standard pip size per symbol (5-decimal FX, 1-decimal gold). */
export function pipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  switch (s) {
    case 'XAUUSD':
      return 0.1;
    case 'EURUSD':
    case 'GBPUSD':
      return 0.0001;
    default:
      if (s.endsWith('JPY')) return 0.01;
      return 0.0001;
  }
}

/** Number of price decimals to show by default. */
export function priceDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') return 2;
  if (s.endsWith('JPY')) return 3;
  return 5;
}

/** Format a price delta as a signed pip count, e.g. "-12.4 pips". */
export function formatPips(symbol: string, delta: number): string {
  const pips = delta / pipSize(symbol);
  const sign = pips > 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)} pips`;
}

/** Currency tags used for news/calendar filtering. */
export const CURRENCY_TAGS = ['USD', 'EUR', 'GBP', 'XAU'] as const;
export type CurrencyTag = (typeof CURRENCY_TAGS)[number];
export const CurrencyTagSchema = z.enum(CURRENCY_TAGS);
