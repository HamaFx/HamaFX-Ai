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

import { ema, sma } from '../src/moving-averages';
import { makeCandles } from './fixtures';

describe('sma', () => {
  it('returns null for the first period-1 entries', () => {
    const out = sma(makeCandles([1, 2, 3, 4, 5]), 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
  });

  it('computes the rolling average correctly', () => {
    const out = sma(makeCandles([1, 2, 3, 4, 5]), 3);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });

  it('returns all-null when length < period', () => {
    expect(sma(makeCandles([1, 2]), 5)).toEqual([null, null]);
  });

  it('rejects period < 1', () => {
    expect(() => sma(makeCandles([1]), 0)).toThrow();
  });
});

describe('ema', () => {
  it('seeds with sma of first period values', () => {
    const out = ema(makeCandles([1, 2, 3]), 3);
    expect(out[2]).toBe(2);
  });

  it('reacts faster than sma to fresh data', () => {
    const closes = [1, 1, 1, 1, 10];
    const e = ema(makeCandles(closes), 3);
    const s = sma(makeCandles(closes), 3);
    expect(e[4]!).toBeGreaterThan(s[4]!);
  });

  it('matches a hand-computed value', () => {
    // closes = [10, 11, 12, 13]; period = 3
    // seed (SMA of [10,11,12]) = 11
    // k = 2/(3+1) = 0.5
    // ema[3] = (13 - 11) * 0.5 + 11 = 12
    expect(ema(makeCandles([10, 11, 12, 13]), 3)[3]).toBe(12);
  });
});
