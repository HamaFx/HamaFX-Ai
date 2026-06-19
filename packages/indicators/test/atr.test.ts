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

import { atr } from '../src/atr';
import { makeCandles } from './fixtures';

describe('atr', () => {
  it('returns all-null when length <= period', () => {
    const out = atr(makeCandles([1, 2, 3]), 14);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('produces a positive value once seeded', () => {
    // 20 bars with monotone closes; highs=closes+1, lows=closes-1
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const out = atr(makeCandles(closes), 14);
    const last = out.at(-1);
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThan(0);
  });
});
