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

// Average True Range (Wilder's smoothing). Period defaults to 14.

import type { Candle } from '@hamafx/shared';

import { padFront } from './util';

export function atr(candles: Candle[], period = 14): (number | null)[] {
  if (period < 1) throw new Error('atr: period must be >= 1');
  if (candles.length <= period) return Array(candles.length).fill(null);

  // True Range[i] = max(high - low, |high - prevClose|, |low - prevClose|)
  // TR[0] is undefined — we use range as a fallback.
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i]!;
    if (i === 0) {
      tr.push(c.h - c.l);
      continue;
    }
    const prev = candles[i - 1]!;
    const a = c.h - c.l;
    const b = Math.abs(c.h - prev.c);
    const d = Math.abs(c.l - prev.c);
    tr.push(Math.max(a, b, d));
  }

  // Seed: SMA over first `period` TRs.
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += tr[i]!;
  let prev = seed / period;

  const out: number[] = [prev];
  for (let i = period; i < tr.length; i += 1) {
    prev = (prev * (period - 1) + tr[i]!) / period;
    out.push(prev);
  }
  return padFront(out, period - 1);
}
