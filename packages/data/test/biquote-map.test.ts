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

// BiQuote symbol/timeframe/datetime mapping tests. Pure functions — no IO.

import { describe, expect, it } from 'vitest';

import {
  parseBiquoteDate,
  toBiquoteSymbol,
  toBiquoteTimeframe,
} from '../src/providers/biquote/map';
import { assertSupportedSymbol } from '../src/providers/biquote/filter';
import { ProviderError } from '../src/errors';

describe('biquote map', () => {
  it('maps every supported symbol identically (BiQuote uses our codes)', () => {
    expect(toBiquoteSymbol('XAUUSD')).toBe('XAUUSD');
    expect(toBiquoteSymbol('EURUSD')).toBe('EURUSD');
    expect(toBiquoteSymbol('GBPUSD')).toBe('GBPUSD');
  });

  it('maps every BiQuote-supported timeframe', () => {
    expect(toBiquoteTimeframe('1m')).toBe('1m');
    expect(toBiquoteTimeframe('5m')).toBe('5m');
    expect(toBiquoteTimeframe('15m')).toBe('15m');
    expect(toBiquoteTimeframe('30m')).toBe('30m');
    expect(toBiquoteTimeframe('1h')).toBe('1h');
    expect(toBiquoteTimeframe('4h')).toBe('4h');
    expect(toBiquoteTimeframe('1d')).toBe('1d');
  });

  it('returns null for weekly (BiQuote does not support W1)', () => {
    expect(toBiquoteTimeframe('1w')).toBeNull();
  });

  it('parses BiQuote ISO-8601 timestamps as UTC', () => {
    expect(parseBiquoteDate('2026-05-27T18:35:01Z')).toBe(Date.UTC(2026, 4, 27, 18, 35, 1));
    expect(parseBiquoteDate('2026-05-27T18:35:01.234Z')).toBe(
      Date.UTC(2026, 4, 27, 18, 35, 1) + 234,
    );
  });

  it('throws on unparseable datetime', () => {
    expect(() => parseBiquoteDate('not-a-date')).toThrow(/cannot parse datetime/);
  });
});

describe('assertSupportedSymbol', () => {
  it('returns the symbol unchanged for valid inputs', () => {
    expect(assertSupportedSymbol('XAUUSD')).toBe('XAUUSD');
    expect(assertSupportedSymbol('EURUSD')).toBe('EURUSD');
    expect(assertSupportedSymbol('GBPUSD')).toBe('GBPUSD');
  });

  it('throws ProviderError for any unsupported instrument', () => {
    expect(() => assertSupportedSymbol('USDJPY')).toThrow(ProviderError);
    expect(() => assertSupportedSymbol('BTCUSD')).toThrow(ProviderError);
    expect(() => assertSupportedSymbol('GARAN')).toThrow(ProviderError);
  });

  it('error message names the offender so debugging is fast', () => {
    try {
      assertSupportedSymbol('USDJPY');
    } catch (err) {
      const e = err as ProviderError;
      expect(e.provider).toBe('biquote');
      expect(e.message).toContain('USDJPY');
    }
  });
});
