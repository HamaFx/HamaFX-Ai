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
