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

import type { Candle, Symbol, Timeframe } from '@hamafx/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lastClosedBar } from '../src/alerts/evaluator';

const SYMBOL: Symbol = 'XAUUSD';

function bars(times: number[], tf: Timeframe): Candle[] {
  return times.map((t) => ({
    symbol: SYMBOL,
    tf,
    t,
    o: 1,
    h: 1,
    l: 1,
    c: 1,
    v: null,
    source: 'test',
    fetchedAt: t,
  }));
}

describe('lastClosedBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the previous bar when the latest bar is still in progress', () => {
    // 1h timeframe. Bars open at 00:00, 01:00, 02:00, 03:00. now = 03:30.
    // The 03:00 bar is in progress (closes at 04:00). The most recently
    // CLOSED bar is the 02:00 bar (closed at 03:00).
    const tf: Timeframe = '1h';
    const hour = 60 * 60_000;
    const start = new Date('2026-05-28T00:00:00Z').getTime();
    vi.setSystemTime(new Date(start + 3 * hour + 30 * 60_000));
    const candles = bars([start, start + hour, start + 2 * hour, start + 3 * hour], tf);
    const last = lastClosedBar(candles, tf);
    expect(last?.t).toBe(start + 2 * hour);
  });

  it('returns the latest bar when it has already fully closed', () => {
    // now sits exactly at the next bar's open — the prior bar is closed.
    const tf: Timeframe = '1h';
    const hour = 60 * 60_000;
    const start = new Date('2026-05-28T00:00:00Z').getTime();
    vi.setSystemTime(new Date(start + 3 * hour));
    const candles = bars([start, start + hour, start + 2 * hour], tf);
    const last = lastClosedBar(candles, tf);
    expect(last?.t).toBe(start + 2 * hour);
  });

  it('handles 1m timeframe', () => {
    const tf: Timeframe = '1m';
    const minute = 60_000;
    const start = new Date('2026-05-28T12:00:00Z').getTime();
    vi.setSystemTime(new Date(start + 2 * minute + 15_000));
    const candles = bars([start, start + minute, start + 2 * minute], tf);
    expect(lastClosedBar(candles, tf)?.t).toBe(start + minute);
  });

  it('handles 1d timeframe', () => {
    const tf: Timeframe = '1d';
    const day = 24 * 60 * 60_000;
    const start = new Date('2026-05-25T00:00:00Z').getTime();
    vi.setSystemTime(new Date(start + 3 * day + 12 * 60 * 60_000));
    const candles = bars([start, start + day, start + 2 * day, start + 3 * day], tf);
    expect(lastClosedBar(candles, tf)?.t).toBe(start + 2 * day);
  });

  it('handles 1w timeframe', () => {
    const tf: Timeframe = '1w';
    const week = 7 * 24 * 60 * 60_000;
    const start = new Date('2026-05-04T00:00:00Z').getTime(); // Mon 00:00 UTC
    vi.setSystemTime(new Date(start + 3 * week + 2 * 24 * 60 * 60_000));
    const candles = bars([start, start + week, start + 2 * week, start + 3 * week], tf);
    expect(lastClosedBar(candles, tf)?.t).toBe(start + 2 * week);
  });

  it('returns null when no bar has closed yet', () => {
    const tf: Timeframe = '1h';
    const start = new Date('2026-05-28T00:00:00Z').getTime();
    vi.setSystemTime(new Date(start + 30 * 60_000));
    const candles = bars([start], tf);
    expect(lastClosedBar(candles, tf)).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(lastClosedBar([], '1h')).toBeNull();
  });
});
