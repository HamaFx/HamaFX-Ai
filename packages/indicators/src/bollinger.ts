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

// Bollinger Bands: middle = SMA(period), upper/lower = middle ± k * stdev(period).

import type { Candle } from '@hamafx/shared';

import { closes, padFront, stdev } from './util';

export interface BollingerPoint {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export function bollinger(candles: Candle[], period = 20, multiplier = 2): BollingerPoint[] {
  if (period < 2) throw new Error('bollinger: period must be >= 2');
  const xs = closes(candles);
  if (xs.length < period) {
    return candles.map(() => ({ upper: null, middle: null, lower: null }));
  }

  const out: BollingerPoint[] = [];
  for (let i = period - 1; i < xs.length; i += 1) {
    const window = xs.slice(i - period + 1, i + 1);
    const m = window.reduce((a, b) => a + b, 0) / period;
    const sd = stdev(window);
    out.push({
      middle: m,
      upper: m + multiplier * sd,
      lower: m - multiplier * sd,
    });
  }

  return padFront(out, period - 1, { upper: null, middle: null, lower: null }) as BollingerPoint[];
}
