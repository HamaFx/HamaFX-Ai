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

import { describe, expect, it } from 'vitest';

import {
  ALL_SYMBOLS,
  BUILTIN_SYMBOLS,
  CFTC_SUPPORTED_SYMBOLS,
  DEFAULT_STREAM_SYMBOLS,
  DEFAULT_WATCHLIST_SYMBOLS,
  SymbolSchema,
  formatPips,
  getSymbolDefinition,
  isKnownSymbol,
  isSymbol,
  normalizeSymbol,
  SYMBOL_MAP,
  symbolsByCategory,
} from '../src';

describe('canonical symbol catalog', () => {
  it('contains exactly the 18 supported canonical instruments', () => {
    expect(Object.isFrozen(BUILTIN_SYMBOLS)).toBe(true);
    expect(ALL_SYMBOLS).toHaveLength(18);
    expect(new Set(ALL_SYMBOLS).size).toBe(ALL_SYMBOLS.length);
    expect(BUILTIN_SYMBOLS.map((symbol) => symbol.internal)).toEqual([...ALL_SYMBOLS]);
    expect(ALL_SYMBOLS.every((symbol) => symbol === symbol.trim().toUpperCase())).toBe(true);
  });

  it('has complete provider and capability metadata for every instrument', () => {
    for (const symbol of BUILTIN_SYMBOLS) {
      expect(symbol.internal).toBeTruthy();
      expect(symbol.display).toBeTruthy();
      expect(symbol.baseCurrency).toBeTruthy();
      expect(symbol.quoteCurrency).toBeTruthy();
      expect(symbol.settlementCurrency).toBeTruthy();
      if (symbol.category === 'crypto') expect(symbol.biquote).toBeNull();
      else expect(symbol.biquote).toBeTruthy();
      expect(symbol.finnhub).toBeTruthy();
      expect(symbol.tradingView).toBeTruthy();
      expect(symbol.decimals).toBeGreaterThanOrEqual(0);
      expect(symbol.pipSize).toBeGreaterThan(0);
      expect(symbol.currencies.length).toBeGreaterThan(0);
      expect(symbol.providers.length).toBeGreaterThan(0);
      expect(Object.isFrozen(symbol)).toBe(true);
      expect(Object.isFrozen(symbol.capabilities)).toBe(true);
      expect(Object.isFrozen(symbol.currencies)).toBe(true);
      expect(Object.isFrozen(symbol.providers)).toBe(true);
      expect(symbol.capabilities.contractSize).toBeGreaterThan(0);
      expect(symbol.capabilities.quantityUnit).toBeTruthy();
      expect(symbol.capabilities.priceDistanceUnit).toBeTruthy();

      if (symbol.category === 'crypto') {
        expect(symbol.binance).toBe(symbol.internal);
        expect(symbol.quoteCurrency).toBe('USDT');
        expect(symbol.settlementCurrency).toBe('USDT');
        expect(symbol.currencies).toEqual(expect.arrayContaining(['USD', 'USDT']));
        expect(symbol.capabilities.quantityUnit).toBe('coins');
        expect(symbol.capabilities.supportsCftc).toBe(false);
        expect(symbol.providers).toContain('binance');
      } else {
        expect(symbol.binance).toBeNull();
        expect(symbol.quoteCurrency).not.toBe('USDT');
      }
    }
  });

  it('keeps the product defaults inside the canonical catalog', () => {
    expect(DEFAULT_WATCHLIST_SYMBOLS).toEqual([
      'XAUUSD',
      'EURUSD',
      'GBPUSD',
      'BTCUSDT',
      'ETHUSDT',
    ]);
    expect(DEFAULT_WATCHLIST_SYMBOLS.every(isKnownSymbol)).toBe(true);
    expect(DEFAULT_STREAM_SYMBOLS).toEqual(ALL_SYMBOLS);
    expect(CFTC_SUPPORTED_SYMBOLS).toEqual(['XAUUSD', 'EURUSD', 'GBPUSD']);
    expect(CFTC_SUPPORTED_SYMBOLS.every(isKnownSymbol)).toBe(true);

    const cftcSymbols = new Set<string>(CFTC_SUPPORTED_SYMBOLS);
    for (const symbol of BUILTIN_SYMBOLS) {
      expect(symbol.capabilities.supportsCftc).toBe(cftcSymbols.has(symbol.internal));
    }
  });

  it('partitions all instruments into gold, forex, and crypto', () => {
    expect(symbolsByCategory('gold')).toEqual(['XAUUSD']);
    expect(symbolsByCategory('forex')).toHaveLength(11);
    expect(symbolsByCategory('crypto')).toEqual([
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'BNBUSDT',
      'XRPUSDT',
      'ADAUSDT',
    ]);
  });
});

describe('symbol normalization and validation', () => {
  it('normalizes supported symbols at the strict schema boundary', () => {
    expect(normalizeSymbol('  btcusdt ')).toBe('BTCUSDT');
    expect(SymbolSchema.parse('  btcusdt ')).toBe('BTCUSDT');
    expect(SymbolSchema.parse(' eurusd ')).toBe('EURUSD');
    expect(isSymbol('  XAUUSD ')).toBe(true);
  });

  it('rejects unsupported aliases instead of silently remapping them', () => {
    expect(isKnownSymbol('BTCUSD')).toBe(false);
    expect(isKnownSymbol('US100')).toBe(false);
    expect(isSymbol('XAGUSD')).toBe(false);
    expect(SymbolSchema.safeParse('BTCUSD').success).toBe(false);
  });

  it('resolves definitions using normalized input', () => {
    expect(getSymbolDefinition(' ethusdt ').internal).toBe('ETHUSDT');
    expect(getSymbolDefinition('USDJPY').capabilities.quantityUnit).toBe('lots');
    expect(() => getSymbolDefinition('BTCUSD')).toThrow('Unknown symbol: BTCUSD');
  });

  it('keeps the lookup map read-only while preserving Map reads', () => {
    expect(SYMBOL_MAP.size).toBe(18);
    expect(SYMBOL_MAP instanceof Map).toBe(true);
    expect(() => (SYMBOL_MAP as Map<string, unknown>).set('DOGEUSDT', {})).toThrow('read-only');
    expect(SYMBOL_MAP.has('DOGEUSDT')).toBe(false);
  });

  it('does not label crypto price distances as pips', () => {
    expect(formatPips('BTCUSDT', 1)).toBe('+1.0 price units');
    expect(formatPips('EURUSD', 0.001)).toBe('+10.0 pips');
  });
});
