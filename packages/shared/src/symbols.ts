// The three supported instruments. This list is INTENTIONALLY tiny — see
// docs/00-overview.md and docs/14-ai-agent-handoff.md. Adding a symbol here
// is a project-wide change that touches data adapters, agent prompts, and UI.

import { z } from 'zod';

export const SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD'] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const SymbolSchema = z.enum(SYMBOLS);

export function isSymbol(value: unknown): value is Symbol {
  return typeof value === 'string' && (SYMBOLS as readonly string[]).includes(value);
}

/** Standard pip size per symbol (5-decimal FX, 1-decimal gold). */
export function pipSize(symbol: Symbol): number {
  switch (symbol) {
    case 'XAUUSD':
      return 0.1;
    case 'EURUSD':
    case 'GBPUSD':
      return 0.0001;
  }
}

/** Number of price decimals to show by default. */
export function priceDecimals(symbol: Symbol): number {
  return symbol === 'XAUUSD' ? 2 : 5;
}

/** Format a price delta as a signed pip count, e.g. "-12.4 pips". */
export function formatPips(symbol: Symbol, delta: number): string {
  const pips = delta / pipSize(symbol);
  const sign = pips > 0 ? '+' : '';
  return `${sign}${pips.toFixed(1)} pips`;
}

/** Currency tags used for news/calendar filtering. */
export const CURRENCY_TAGS = ['USD', 'EUR', 'GBP', 'XAU'] as const;
export type CurrencyTag = (typeof CURRENCY_TAGS)[number];
export const CurrencyTagSchema = z.enum(CURRENCY_TAGS);
