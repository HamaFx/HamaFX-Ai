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

// Shared helpers for indicator implementations. All functions here are
// pure: same inputs → same output, no side effects.

import type { Candle } from '@hamafx/shared';

/** Extract close prices from a candle window. */
export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.c);
}

export function highs(candles: Candle[]): number[] {
  return candles.map((c) => c.h);
}

export function lows(candles: Candle[]): number[] {
  return candles.map((c) => c.l);
}

/**
 * Pad an indicator series to the same length as the source candles, with
 * `null` for the first `nullCount` entries (where the indicator can't
 * produce a value yet).
 */
export function padFront<T>(series: T[], nullCount: number, fill: T | null = null): (T | null)[] {
  const out: (T | null)[] = [];
  for (let i = 0; i < nullCount; i += 1) out.push(fill);
  for (const v of series) out.push(v);
  return out;
}

/** Numeric average of a finite array. Returns NaN for empty input. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return Number.NaN;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Sample standard deviation (Bessel's correction). NaN for length < 2. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return Number.NaN;
  const m = mean(xs);
  let sq = 0;
  for (const x of xs) sq += (x - m) ** 2;
  return Math.sqrt(sq / (xs.length - 1));
}
