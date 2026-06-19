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

// Relative Strength Index (Wilder's smoothing). Period defaults to 14.
// Output values are 0–100, aligned 1:1 with `candles`. First `period`
// entries are `null` because the seed needs `period` deltas.

import type { Candle } from '@hamafx/shared';

import { closes, padFront } from './util';

export function rsi(candles: Candle[], period = 14): (number | null)[] {
  if (period < 1) throw new Error('rsi: period must be >= 1');
  const xs = closes(candles);
  if (xs.length <= period) return Array(xs.length).fill(null);

  // Seed: SMA of first `period` gains and losses.
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = xs[i]! - xs[i - 1]!;
    if (delta >= 0) gains += delta;
    else losses += -delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  const out: number[] = [];
  // First RSI value lands at index `period`.
  out.push(rsiFromAverages(avgGain, avgLoss));

  for (let i = period + 1; i < xs.length; i += 1) {
    const delta = xs[i]! - xs[i - 1]!;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push(rsiFromAverages(avgGain, avgLoss));
  }

  return padFront(out, period);
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
