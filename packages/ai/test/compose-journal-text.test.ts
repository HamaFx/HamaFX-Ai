import { describe, expect, it } from 'vitest';
import { composeJournalText } from '../src/memory/memory-index';

// Journal entry row shape
interface JournalRow {
  id: string;
  side: string;
  symbol: string;
  entry: number;
  stop: number | null;
  target: number | null;
  exit: number | null;
  outcome: string;
  rMultiple: number | null;
  tags: string[] | null;
  notes: string | null;
  openedAt: Date;
}

function makeJournalRow(overrides: Partial<JournalRow> = {}): JournalRow {
  return {
    id: 'entry-1',
    side: 'long',
    symbol: 'XAUUSD',
    entry: 1950,
    stop: 1940,
    target: 1970,
    exit: null,
    outcome: 'open',
    rMultiple: null,
    tags: null,
    notes: null,
    openedAt: new Date(),
    ...overrides,
  };
}

describe('composeJournalText', () => {
  it('composes a long entry text', () => {
    const row = makeJournalRow({ side: 'long', symbol: 'XAUUSD', entry: 1950 });
    const text = composeJournalText(row as never);
    expect(text).toContain('Long XAUUSD @ 1950');
  });

  it('composes a short entry text', () => {
    const row = makeJournalRow({ side: 'short', symbol: 'EURUSD', entry: 1.0850 });
    const text = composeJournalText(row as never);
    expect(text).toContain('Short EURUSD @ 1.085');
  });

  it('includes stop and target when set', () => {
    const row = makeJournalRow({ stop: 1940, target: 1970 });
    const text = composeJournalText(row as never);
    expect(text).toContain('stop 1940');
    expect(text).toContain('target 1970');
  });

  it('omits null stop and target', () => {
    const row = makeJournalRow({ stop: null, target: null, exit: null, outcome: 'open' });
    const text = composeJournalText(row as never);
    expect(text).not.toContain('stop');
    expect(text).not.toContain('target');
    expect(text).not.toContain('exit');
  });

  it('includes exit when trade is closed', () => {
    const row = makeJournalRow({ outcome: 'win', exit: 1970, rMultiple: 2.0 });
    const text = composeJournalText(row as never);
    expect(text).toContain('exit 1970');
    expect(text).toContain('outcome win');
    expect(text).toContain('R 2.00');
  });

  it('includes tags when present', () => {
    const row = makeJournalRow({ tags: ['trend', 'support'] });
    const text = composeJournalText(row as never);
    expect(text).toContain('tags trend, support');
  });

  it('includes notes when present', () => {
    const row = makeJournalRow({ notes: 'Entered on breakout' });
    const text = composeJournalText(row as never);
    expect(text).toContain('Entered on breakout');
  });

  it('separates fields with interpunct', () => {
    const row = makeJournalRow({ stop: 1940, target: 1970 });
    const text = composeJournalText(row as never);
    expect(text).toContain(' · ');
  });
});
