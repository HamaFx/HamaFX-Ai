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

import { classicPivots, pivotsAligned } from '../src/pivots';
import { makeCandles } from './fixtures';

describe('classicPivots', () => {
  it('matches the textbook formula', () => {
    // prevHigh=110, prevLow=90, prevClose=105
    // pp = (110 + 90 + 105) / 3 = 101.666...
    // r1 = 2*pp - prevLow = 113.333...
    // s1 = 2*pp - prevHigh = 93.333...
    const p = classicPivots(110, 90, 105);
    expect(p.pp).toBeCloseTo(101.666_666, 5);
    expect(p.r1).toBeCloseTo(113.333_333, 5);
    expect(p.s1).toBeCloseTo(93.333_333, 5);
    // r2 = pp + (h - l)
    expect(p.r2).toBeCloseTo(p.pp + 20, 10);
    expect(p.s2).toBeCloseTo(p.pp - 20, 10);
  });
});

describe('pivotsAligned', () => {
  it('returns null for the first candle and pivots for the rest', () => {
    const candles = makeCandles([1, 2, 3]);
    const out = pivotsAligned(candles);
    expect(out[0]).toBeNull();
    expect(out[1]).not.toBeNull();
    expect(out[2]).not.toBeNull();
  });
});
