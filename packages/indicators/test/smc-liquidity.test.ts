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

import type { Candle } from '@hamafx/shared';
import { describe, expect, it } from 'vitest';

import { detectLiquiditySweeps } from '../src/smc/liquidity';
import { findSwings } from '../src/smc/swings';

function bar(i: number, o: number, h: number, l: number, c: number): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t: i * 3_600_000,
    o,
    h,
    l,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

describe('detectLiquiditySweeps', () => {
  it('returns empty when no swings exist', () => {
    expect(detectLiquiditySweeps([], [])).toEqual([]);
  });

  it('detects a swing-high sweep: wick > level, close < level', () => {
    // Build: clear swing high at idx 3, then later bar wicks above + closes back below.
    const candles = [
      bar(0, 1, 1.5, 0.5, 1.2),
      bar(1, 1.2, 2.0, 1.0, 1.8),
      bar(2, 1.8, 3.0, 1.5, 2.5),
      bar(3, 2.5, 5.0, 2.0, 4.0), // swing high price = 5.0
      bar(4, 4.0, 4.5, 3.0, 3.5),
      bar(5, 3.5, 4.0, 3.0, 3.5),
      bar(6, 3.5, 4.0, 3.0, 3.5),
      bar(7, 3.5, 5.5, 3.0, 3.2), // wick to 5.5 (above 5.0), close 3.2 < 5.0 → sweep
    ];
    const swings = findSwings(candles, { lookback: 2 });
    const sweeps = detectLiquiditySweeps(candles, swings);
    expect(sweeps.some((s) => s.side === 'high' && s.index === 7 && s.level === 5)).toBe(true);
  });

  it('detects a swing-low sweep symmetrically', () => {
    const candles = [
      bar(0, 5, 5.5, 4.5, 5.0),
      bar(1, 5.0, 5.5, 4.0, 4.5),
      bar(2, 4.5, 5.0, 3.5, 4.0),
      bar(3, 4.0, 4.5, 1.0, 2.5), // swing low price = 1.0
      bar(4, 2.5, 3.5, 2.0, 3.0),
      bar(5, 3.0, 3.5, 2.5, 3.0),
      bar(6, 3.0, 3.5, 2.5, 3.0),
      bar(7, 3.0, 3.5, 0.5, 2.0), // wick to 0.5 below 1.0, close 2.0 > 1.0 → sweep
    ];
    const swings = findSwings(candles, { lookback: 2 });
    const sweeps = detectLiquiditySweeps(candles, swings);
    expect(sweeps.some((s) => s.side === 'low' && s.index === 7)).toBe(true);
  });

  it('does NOT count a clean break (close beyond level) as a sweep', () => {
    // Bar 7 closes ABOVE 5.0 — that's a break, not a sweep.
    const candles = [
      bar(0, 1, 1.5, 0.5, 1.2),
      bar(1, 1.2, 2.0, 1.0, 1.8),
      bar(2, 1.8, 3.0, 1.5, 2.5),
      bar(3, 2.5, 5.0, 2.0, 4.0),
      bar(4, 4.0, 4.5, 3.0, 3.5),
      bar(5, 3.5, 4.0, 3.0, 3.5),
      bar(6, 3.5, 4.0, 3.0, 3.5),
      bar(7, 3.5, 5.5, 3.0, 5.4), // close above 5.0 → break
    ];
    const swings = findSwings(candles, { lookback: 2 });
    const sweeps = detectLiquiditySweeps(candles, swings);
    expect(sweeps.length).toBe(0);
  });
});
