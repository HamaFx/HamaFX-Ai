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

// Daily snapshot computation — pure function over a candle array.
//
// Inputs: candles + an `asOf` timestamp marking the UTC midnight of the day
// the snapshot describes. Output: a flat object suitable for the
// `snapshots.data` JSONB column. Caller is responsible for passing the
// correct candle window (1H or finer covering the previous full UTC day
// plus enough trailing bars for ATR).
//
// All math is deterministic — no clock reads, no env reads — so this is
// the right place to property-test if we want to.

import type { Candle } from '@hamafx/shared';

import { computeAsianRange } from '@hamafx/indicators';
import { computePdhPdl } from '@hamafx/indicators';
import { atr } from '@hamafx/indicators';
import { classicPivots } from '@hamafx/indicators';

export interface DailySnapshot {
  /** UTC ms of midnight starting the SUBJECT day. */
  asOfMs: number;
  /** OHLC for the subject day (exclusive of the asOf bar — first/last by time). */
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  /** Classic floor-trader pivots derived from the subject day's HLC. */
  pivot: number | null;
  r1: number | null;
  r2: number | null;
  s1: number | null;
  s2: number | null;
  /** ATR(14) computed against the candle window — handy ambient volatility. */
  atr14: number | null;
  /** Previous-day extremes (relative to the latest bar). */
  prevDayHigh: number | null;
  prevDayLow: number | null;
  /** Asian session (00:00–07:00 UTC) extremes for the latest day. */
  asianRangeHigh: number | null;
  asianRangeLow: number | null;
}

export interface ComputeDailySnapshotArgs {
  candles: Candle[];
  /** UTC midnight of the day the snapshot describes. */
  asOf: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeDailySnapshot(args: ComputeDailySnapshotArgs): DailySnapshot {
  const asOfMs = startOfUtcDay(args.asOf.getTime());
  const dayEndMs = asOfMs + DAY_MS;
  const subject = args.candles.filter((c) => c.t >= asOfMs && c.t < dayEndMs);

  let open: number | null = null;
  let high: number | null = null;
  let low: number | null = null;
  let close: number | null = null;
  if (subject.length > 0) {
    open = subject[0]!.o;
    close = subject[subject.length - 1]!.c;
    high = Number.NEGATIVE_INFINITY;
    low = Number.POSITIVE_INFINITY;
    for (const c of subject) {
      if (c.h > high) high = c.h;
      if (c.l < low) low = c.l;
    }
    if (!Number.isFinite(high)) high = null;
    if (!Number.isFinite(low)) low = null;
  }

  // Pivots derived from the subject day's HLC. classicPivots needs the
  // (prevHigh, prevLow, prevClose) tuple as positional args.
  const piv =
    high !== null && low !== null && close !== null
      ? classicPivots(high, low, close)
      : null;

  // ATR over the full candle window — most recent value.
  const atrSeries = atr(args.candles, 14);
  const atr14 = lastFiniteNumber(atrSeries);

  const pdh = computePdhPdl(args.candles);
  const ar = computeAsianRange(args.candles);

  return {
    asOfMs,
    open,
    high,
    low,
    close,
    pivot: piv?.pp ?? null,
    r1: piv?.r1 ?? null,
    r2: piv?.r2 ?? null,
    s1: piv?.s1 ?? null,
    s2: piv?.s2 ?? null,
    atr14,
    prevDayHigh: pdh?.high ?? null,
    prevDayLow: pdh?.low ?? null,
    asianRangeHigh: ar?.high ?? null,
    asianRangeLow: ar?.low ?? null,
  };
}

/**
 * Returns the UTC midnight (ms) of the day that precedes `now` — i.e. the
 * most-recent fully-completed day. Caller passes `Date.now()` and gets back
 * a stable subject day for the cron handler.
 */
export function previousUtcMidnight(now: number = Date.now()): Date {
  const today = startOfUtcDay(now);
  return new Date(today - DAY_MS);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function lastFiniteNumber(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}
