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

import { parseIndicatorSpec } from '../src/alerts/evaluator';

describe('parseIndicatorSpec — strict', () => {
  it('parses the bare indicator name with default params', () => {
    expect(parseIndicatorSpec('rsi')).toEqual({ kind: 'rsi', params: { period: 14 } });
    expect(parseIndicatorSpec('ema')).toEqual({ kind: 'ema', params: { period: 20 } });
  });

  it('parses a single-period spec', () => {
    expect(parseIndicatorSpec('rsi:14')).toEqual({ kind: 'rsi', params: { period: 14 } });
    expect(parseIndicatorSpec('ema:50')).toEqual({ kind: 'ema', params: { period: 50 } });
    expect(parseIndicatorSpec('atr:21')).toEqual({ kind: 'atr', params: { period: 21 } });
  });

  it('parses macd with three params', () => {
    expect(parseIndicatorSpec('macd:12,26,9')).toEqual({
      kind: 'macd',
      params: { fast: 12, slow: 26, signal: 9 },
    });
  });

  it('parses bollinger with two params', () => {
    expect(parseIndicatorSpec('bollinger:20,2')).toEqual({
      kind: 'bollinger',
      params: { period: 20, multiplier: 2 },
    });
  });

  it('parses pivots without params', () => {
    expect(parseIndicatorSpec('pivots')).toEqual({ kind: 'pivots', params: {} });
  });

  it('case-insensitive on the kind', () => {
    expect(parseIndicatorSpec('RSI:14')).toEqual({ kind: 'rsi', params: { period: 14 } });
  });

  it('rejects trailing junk that the legacy parser silently dropped', () => {
    expect(parseIndicatorSpec('rsi:14:bogus')).toBeNull();
    expect(parseIndicatorSpec('ema:14,bogus')).toBeNull();
    expect(parseIndicatorSpec('rsi 14')).toBeNull();
  });

  it('rejects unknown indicators', () => {
    expect(parseIndicatorSpec('foo')).toBeNull();
    expect(parseIndicatorSpec('foo:14')).toBeNull();
  });

  it('rejects too-many params for single-period kinds', () => {
    expect(parseIndicatorSpec('rsi:14,9')).toBeNull();
    expect(parseIndicatorSpec('ema:14,21,55')).toBeNull();
  });

  it('rejects non-positive periods', () => {
    expect(parseIndicatorSpec('rsi:0')).toBeNull();
  });

  it('rejects pivots with params', () => {
    expect(parseIndicatorSpec('pivots:1')).toBeNull();
  });
});
