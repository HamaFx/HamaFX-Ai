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

// Fair Value Gap (3-bar imbalance) detection.
//
// Bullish FVG: at index i (middle of bar 1, 2, 3 = i-1, i, i+1):
//   low[i+1] > high[i-1]
// The gap zone is [high[i-1], low[i+1]] — price often retraces here.
//
// Bearish FVG: high[i+1] < low[i-1]; gap is [high[i+1], low[i-1]].
//
// We also flag `mitigated` once a later bar's range overlaps the gap. This
// helps the chart UI dim already-tested zones.

import type { Candle, FvgZone } from '@hamafx/shared';

export interface DetectFvgOptions {
  /**
   * Minimum gap size as a fraction of bar range. Filters tiny gaps that are
   * usually noise. 0 disables the filter. Default: 0 (keep all).
   */
  minSizeRatio?: number;
}

export function detectFvgs(candles: Candle[], opts: DetectFvgOptions = {}): FvgZone[] {
  const minRatio = opts.minSizeRatio ?? 0;
  if (candles.length < 3) return [];

  const out: FvgZone[] = [];

  // Walk i from 1 to length-2 (middle bar of each 3-bar window).
  for (let i = 1; i < candles.length - 1; i += 1) {
    const a = candles[i - 1]!;
    const c = candles[i + 1]!;

    const bullishGap = c.l > a.h;
    const bearishGap = c.h < a.l;

    if (!bullishGap && !bearishGap) continue;

    const top = bullishGap ? c.l : a.l;
    const bottom = bullishGap ? a.h : c.h;
    const gapSize = top - bottom;

    if (minRatio > 0) {
      const middleRange = candles[i]!.h - candles[i]!.l;
      if (middleRange > 0 && gapSize / middleRange < minRatio) continue;
    }

    // Mitigation check: any later bar whose range touches [bottom, top]?
    let mitigated = false;
    let maxPenetration = 0;
    for (let j = i + 2; j < candles.length; j += 1) {
      const b = candles[j]!;
      if (b.l <= top && b.h >= bottom) {
        mitigated = true;
        // Track deepest penetration into the gap
        if (bullishGap) {
          // Bearish retracement into bullish FVG: how far down from top
          const penetration = top - b.l;
          if (penetration > maxPenetration) maxPenetration = penetration;
        } else {
          // Bullish retracement into bearish FVG: how far up from bottom
          const penetration = b.h - bottom;
          if (penetration > maxPenetration) maxPenetration = penetration;
        }
      }
    }

    const percentFilled = gapSize > 0 ? Math.min(1, maxPenetration / gapSize) : 0;

    out.push({
      side: bullishGap ? 'bullish' : 'bearish',
      startIndex: i - 1,
      endIndex: i + 1,
      startTime: a.t,
      endTime: c.t,
      top,
      bottom,
      mitigated,
      percentFilled,
    });
  }

  return out;
}
