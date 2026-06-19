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

// Tiny candle fixture used across indicator tests. Values picked so each
// indicator has a tractable hand-computable answer.

import type { Candle } from '@hamafx/shared';

export function makeCandles(
  closes: number[],
  opts?: { highs?: number[]; lows?: number[] },
): Candle[] {
  return closes.map((c, i) => ({
    symbol: 'XAUUSD' as const,
    tf: '1h' as const,
    t: i * 3_600_000,
    o: c,
    h: opts?.highs?.[i] ?? c + 1,
    l: opts?.lows?.[i] ?? c - 1,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  }));
}
