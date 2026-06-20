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

// Pure-logic tests for journal stats math.

import type { JournalEntry } from '@hamafx/shared';
import { describe, expect, it } from 'vitest';

import { computeRMultiple, summarize } from '../src/journal/persistence';

function entry(partial: Partial<JournalEntry>): JournalEntry {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    symbol: 'XAUUSD',
    side: 'long',
    openedAt: 0,
    closedAt: null,
    entry: 100,
    stop: null,
    target: null,
    exit: null,
    size: null,
    outcome: 'open',
    rMultiple: null,
    notes: null,
    tags: [],
    attachments: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('computeRMultiple', () => {
  it('long winner: exit above entry, scaled by stop distance', () => {
    // entry=100, stop=95 (risk=5), exit=110 → R = 10/5 = 2
    expect(computeRMultiple({ side: 'long', entry: 100, stop: 95, exit: 110 })).toBeCloseTo(2);
  });
  it('long loser: exit below entry → negative R', () => {
    expect(computeRMultiple({ side: 'long', entry: 100, stop: 95, exit: 95 })).toBeCloseTo(-1);
  });
  it('short winner: exit below entry', () => {
    expect(computeRMultiple({ side: 'short', entry: 100, stop: 105, exit: 90 })).toBeCloseTo(2);
  });
  it('short loser: exit above entry', () => {
    expect(computeRMultiple({ side: 'short', entry: 100, stop: 105, exit: 105 })).toBeCloseTo(-1);
  });
  it('returns 0 when stop equals entry (zero risk)', () => {
    expect(computeRMultiple({ side: 'long', entry: 100, stop: 100, exit: 110 })).toBe(0);
  });
});

describe('summarize', () => {
  it('returns zeros for empty input', () => {
    const s = summarize([]);
    expect(s).toMatchObject({ count: 0, wins: 0, losses: 0, breakevens: 0, open: 0 });
    expect(s.winRate).toBe(0);
    expect(s.avgR).toBe(0);
    expect(s.totalR).toBe(0);
  });

  it('counts open trades but excludes them from win-rate / avgR', () => {
    const s = summarize([
      entry({ outcome: 'open' }),
      entry({ outcome: 'win', rMultiple: 1.5 }),
      entry({ outcome: 'win', rMultiple: 2 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
    ]);
    expect(s.count).toBe(4);
    expect(s.open).toBe(1);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(2 / 3, 5);
    expect(s.totalR).toBeCloseTo(2.5);
    expect(s.avgR).toBeCloseTo(2.5 / 3, 5);
  });

  it('breakevens count as closed but contribute zero to R', () => {
    const s = summarize([
      entry({ outcome: 'breakeven', rMultiple: 0 }),
      entry({ outcome: 'win', rMultiple: 1 }),
    ]);
    expect(s.breakevens).toBe(1);
    expect(s.winRate).toBeCloseTo(0.5);
    expect(s.totalR).toBeCloseTo(1);
  });
});

describe('Phase B item 13 — extended journal stats', () => {
  it('reports zero for all extended metrics on empty input', () => {
    const s = summarize([]);
    expect(s.maxDrawdown).toBe(0);
    expect(s.longestWinStreak).toBe(0);
    expect(s.longestLossStreak).toBe(0);
    expect(s.profitFactor).toBe(0);
    expect(s.avgHoldMs).toBe(0);
    expect(s.perDayOfWeek).toEqual({
      sunday: 0,
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 0,
      saturday: 0,
    });
  });

  it('computes max drawdown from a sequence of R-multiples', () => {
    // 1R, 1R, 1R (peak=3), -2R, -2R (drawdown from peak 3 to -1 = 4)
    const s = summarize([
      entry({ openedAt: 1, closedAt: 2, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 3, closedAt: 4, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 5, closedAt: 6, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 7, closedAt: 8, outcome: 'loss', rMultiple: -2 }),
      entry({ openedAt: 9, closedAt: 10, outcome: 'loss', rMultiple: -2 }),
    ]);
    expect(s.maxDrawdown).toBeCloseTo(4);
  });

  it('tracks the longest win and loss streaks (breakevens do not reset)', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'breakeven', rMultiple: 0 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
    ]);
    // Breakevens do not break a streak — the 2 wins + breakeven +
    // 3 wins form a single 5-win streak. The 2 consecutive losses
    // at the tail form the longest loss streak.
    expect(s.longestWinStreak).toBe(5);
    expect(s.longestLossStreak).toBe(2);
  });

  it('a loss does break a win streak', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'loss', rMultiple: -1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
    ]);
    expect(s.longestWinStreak).toBe(2);
  });

  it('computes profit factor as gross wins / |gross losses|', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 2 }),
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'loss', rMultiple: -0.5 }),
    ]);
    // (2 + 1) / 0.5 = 6
    expect(s.profitFactor).toBeCloseTo(6);
  });

  it('returns null profit factor when there are wins but no losses', () => {
    const s = summarize([
      entry({ outcome: 'win', rMultiple: 1 }),
      entry({ outcome: 'win', rMultiple: 1 }),
    ]);
    expect(s.profitFactor).toBeNull();
  });

  it('returns 0 profit factor when there are no wins and no losses', () => {
    const s = summarize([entry({ outcome: 'breakeven', rMultiple: 0 })]);
    expect(s.profitFactor).toBe(0);
  });

  it('computes avg hold time from closedAt - openedAt', () => {
    const s = summarize([
      entry({ openedAt: 0, closedAt: 60_000, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: 0, closedAt: 120_000, outcome: 'loss', rMultiple: -1 }),
    ]);
    expect(s.avgHoldMs).toBe(90_000);
  });

  it('groups entries by day of week (UTC) of closedAt', () => {
    // 2026-06-21 is a Sunday (UTC). 2026-06-15 is a Monday.
    // 2026-06-17 is a Wednesday.
    const sunday = Date.UTC(2026, 5, 21, 12, 0, 0); // Sun
    const monday = Date.UTC(2026, 5, 15, 12, 0, 0); // Mon
    const wednesday = Date.UTC(2026, 5, 17, 12, 0, 0); // Wed
    const s = summarize([
      entry({ openedAt: sunday, closedAt: sunday + 1, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: monday, closedAt: monday + 1, outcome: 'win', rMultiple: 1 }),
      entry({ openedAt: wednesday, closedAt: wednesday + 1, outcome: 'loss', rMultiple: -1 }),
    ]);
    expect(s.perDayOfWeek).toEqual({
      sunday: 1,
      monday: 1,
      tuesday: 0,
      wednesday: 1,
      thursday: 0,
      friday: 0,
      saturday: 0,
    });
  });

  it('open trades do not contribute to per-day-of-week counts', () => {
    const monday = Date.UTC(2026, 5, 15, 12, 0, 0);
    const s = summarize([
      entry({ openedAt: monday, closedAt: null, outcome: 'open', rMultiple: null }),
    ]);
    expect(s.perDayOfWeek?.monday).toBe(0);
  });
});
