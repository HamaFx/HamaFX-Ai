// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '@hamafx/shared';
import { buildEquityCurve } from '@/components/chart/performance-chart-data';

function makeEntry(partial: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'id',
    userId: 'user',
    symbol: 'XAUUSD',
    direction: 'long',
    openedAt: Date.now(),
    closedAt: null,
    rMultiple: null,
    ...partial,
  } as JournalEntry;
}

describe('buildEquityCurve', () => {
  it('returns empty data when there are no closed entries', () => {
    const result = buildEquityCurve([
      makeEntry({ closedAt: null, rMultiple: null }),
    ]);
    expect(result.data).toHaveLength(0);
    expect(result.totalR).toBe(0);
  });

  it('builds a cumulative R-multiple curve sorted by open time', () => {
    const result = buildEquityCurve([
      makeEntry({ openedAt: 2000, closedAt: 3000, rMultiple: 1.5 }),
      makeEntry({ openedAt: 1000, closedAt: 2000, rMultiple: -0.5 }),
      makeEntry({ openedAt: 1500, closedAt: 2500, rMultiple: 2 }),
    ]);

    expect(result.data).toEqual([
      { time: 2, value: -0.5 },
      { time: 3, value: 1.5 },
      { time: 4, value: 3.0 },
    ]);
    expect(result.totalR).toBe(3.0);
  });

  it('increments duplicate timestamps by one second', () => {
    const result = buildEquityCurve([
      makeEntry({ openedAt: 1000, closedAt: 5000, rMultiple: 1 }),
      makeEntry({ openedAt: 2000, closedAt: 5000, rMultiple: 2 }),
      makeEntry({ openedAt: 3000, closedAt: 5000, rMultiple: 3 }),
    ]);

    expect(result.data.map((d) => d.time)).toEqual([5, 6, 7]);
    expect(result.totalR).toBe(6);
  });
});
