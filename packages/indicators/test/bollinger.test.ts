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

import { bollinger } from '../src/bollinger';
import { makeCandles } from './fixtures';

describe('bollinger', () => {
  it('returns null bands when not enough data', () => {
    const out = bollinger(makeCandles([1, 2, 3]), 20);
    for (const p of out) expect(p).toEqual({ upper: null, middle: null, lower: null });
  });

  it('upper > middle > lower for a noisy series', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 2);
    const out = bollinger(makeCandles(closes), 20, 2);
    const last = out.at(-1)!;
    expect(last.upper!).toBeGreaterThan(last.middle!);
    expect(last.middle!).toBeGreaterThan(last.lower!);
  });

  it('middle == sma for the same period', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = bollinger(makeCandles(closes), 5, 2);
    // middle at index 4 (5th close) = mean(1..5) = 3
    expect(out[4]!.middle).toBe(3);
  });
});
