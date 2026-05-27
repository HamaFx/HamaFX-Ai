// Tests for the candles_1m pseudo-provider.

import { describe, expect, it, vi } from 'vitest';

import { ProviderError } from '../src/errors';
import { fetchCandles1m } from '../src/providers/candles-1m';

interface FakeRow {
  t: Date;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
  source: string;
}

function makeFakeDb(rows: FakeRow[]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => rows),
        })),
      })),
    })),
  } as unknown as NonNullable<Parameters<typeof fetchCandles1m>[0]['db']>;
}

function bar(tIso: string, mid: number): FakeRow {
  return {
    t: new Date(tIso),
    o: mid,
    h: mid + 0.5,
    l: mid - 0.5,
    c: mid + 0.1,
    v: null,
    source: 'biquote-signalr',
  };
}

describe('fetchCandles1m', () => {
  it('returns the most recent bars in oldest-first order', async () => {
    const now = Date.now();
    const rows = [
      bar(new Date(now - 120_000).toISOString(), 2389),
      bar(new Date(now - 60_000).toISOString(), 2390),
      bar(new Date(now - 1_000).toISOString(), 2391),
    ];
    const db = makeFakeDb(rows);

    const r = await fetchCandles1m({ symbol: 'XAUUSD', count: 100, db });
    expect(r.bars).toHaveLength(3);
    expect(r.bars[0]?.o).toBe(2389);
    expect(r.bars[2]?.o).toBe(2391);
    expect(r.provider).toBe('biquote-signalr');
  });

  it('throws ProviderError when no rows exist', async () => {
    const db = makeFakeDb([]);
    await expect(
      fetchCandles1m({ symbol: 'XAUUSD', count: 100, db }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws ProviderError when the freshest bar is older than the freshness window', async () => {
    const stale = bar(new Date(Date.now() - 5 * 60_000).toISOString(), 2390);
    const db = makeFakeDb([stale]);
    await expect(
      fetchCandles1m({ symbol: 'XAUUSD', count: 100, db }),
    ).rejects.toMatchObject({
      provider: 'candles-1m',
      message: expect.stringContaining('stale') as unknown as string,
    });
  });

  it('caps count at 5000', async () => {
    const now = Date.now();
    const rows = Array.from({ length: 200 }, (_, i) =>
      bar(new Date(now - (200 - i) * 60_000).toISOString(), 2390 + i * 0.01),
    );
    const db = makeFakeDb(rows);

    const r = await fetchCandles1m({ symbol: 'XAUUSD', count: 99999, db });
    expect(r.bars.length).toBeLessThanOrEqual(5000);
    expect(r.bars.length).toBe(200); // all available rows, capped to 5000
  });

  it('returns the trailing `count` bars when more rows exist', async () => {
    const now = Date.now();
    const rows = Array.from({ length: 50 }, (_, i) =>
      bar(new Date(now - (50 - i) * 60_000).toISOString(), 2390 + i),
    );
    const db = makeFakeDb(rows);

    const r = await fetchCandles1m({ symbol: 'XAUUSD', count: 10, db });
    expect(r.bars).toHaveLength(10);
    // Last bar is the freshest (last row)
    expect(r.bars[r.bars.length - 1]?.o).toBe(2439);
  });
});
