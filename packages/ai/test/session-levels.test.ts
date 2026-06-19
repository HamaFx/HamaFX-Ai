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

// Verifies session boundary slicing: the tool MUST classify candles
// into asia (00–07), london (07–12), ny (12–21) UTC windows and surface
// `forming: true` when the session window's right edge is in the future.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Candle, SessionTag } from '@hamafx/shared';

vi.mock('@hamafx/data', () => ({
  getCandles: vi.fn(),
}));

import { getCandles } from '@hamafx/data';

import { getSessionLevelsTool } from '../src/tools/get-session-levels';

const exec = getSessionLevelsTool.execute as unknown as (
  input: unknown,
) => Promise<{
  today: Array<{
    session: SessionTag;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    forming: boolean;
  }>;
  prior: Array<{
    session: SessionTag;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  }> | null;
  pipelinePending: boolean;
}>;

function bar(c: number, t: number): Candle {
  return {
    symbol: 'XAUUSD',
    tf: '1h',
    t,
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(getCandles).mockReset();
});

beforeEach(() => {
  vi.useFakeTimers();
  // Fix "now" to 2026-05-26 09:00:00 UTC — mid-London. So Asia is closed,
  // London is forming, NY is in the future.
  vi.setSystemTime(new Date('2026-05-26T09:00:00Z'));
});

describe('get_session_levels — session slicing', () => {
  it('flags Asia closed, London forming, NY upcoming for a 09:00 UTC clock', async () => {
    // Build 1H bars at 00:00..09:00 UTC for today. Asia (00–07) gets
    // bars at 0..6; London (07–12) gets 7..8 (forming).
    const today = new Date('2026-05-26T00:00:00Z').getTime();
    const candles: Candle[] = [];
    for (let h = 0; h <= 9; h += 1) {
      candles.push(bar(2400 + h, today + h * 60 * 60 * 1000));
    }
    vi.mocked(getCandles).mockResolvedValueOnce(candles);

    const r = await exec({ symbol: 'XAUUSD', includePrior: false });
    expect(r.pipelinePending).toBe(false);

    const asia = r.today.find((s) => s.session === 'asia')!;
    const london = r.today.find((s) => s.session === 'london')!;
    const ny = r.today.find((s) => s.session === 'ny')!;

    expect(asia.forming).toBe(false);
    expect(asia.close).not.toBeNull(); // Asia ended at 07:00 UTC
    expect(asia.high).toBeGreaterThan(0);

    expect(london.forming).toBe(true);
    // London is forming → no close
    expect(london.close).toBeNull();
    expect(london.open).not.toBeNull();

    expect(ny.forming).toBe(true);
    // NY hasn't started yet → no bars in window
    expect(ny.high).toBeNull();
    expect(ny.low).toBeNull();
  });

  it('returns pipelinePending=true with no candles', async () => {
    vi.mocked(getCandles).mockResolvedValueOnce([] as Candle[]);
    const r = await exec({ symbol: 'XAUUSD', includePrior: false });
    expect(r.pipelinePending).toBe(true);
    expect(r.today).toEqual([]);
  });

  it('emits prior-day rows when includePrior=true', async () => {
    const today = new Date('2026-05-26T00:00:00Z').getTime();
    const yesterday = today - 24 * 60 * 60 * 1000;

    const candles: Candle[] = [];
    // Yesterday: cover all 24h.
    for (let h = 0; h < 24; h += 1) {
      candles.push(bar(2380 + h, yesterday + h * 60 * 60 * 1000));
    }
    // Today: 0..9.
    for (let h = 0; h <= 9; h += 1) {
      candles.push(bar(2400 + h, today + h * 60 * 60 * 1000));
    }
    vi.mocked(getCandles).mockResolvedValueOnce(candles);

    const r = await exec({ symbol: 'XAUUSD', includePrior: true });
    expect(r.prior).not.toBeNull();
    expect(r.prior).toHaveLength(3);
    // All three prior sessions should have a non-null close.
    for (const s of r.prior!) {
      expect(s.close).not.toBeNull();
    }
  });
});
