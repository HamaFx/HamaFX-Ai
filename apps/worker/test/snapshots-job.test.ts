import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/ai', () => ({
  computeDailySnapshot: vi.fn(),
  previousUtcMidnight: () => new Date('2026-05-26T00:00:00Z'),
  upsertSnapshot: vi.fn(),
}));

vi.mock('@hamafx/data', () => ({
  getCandles: vi.fn(),
}));

// We don't need a real DB. Patch getDb() to return a fake client whose
// .delete().where().returning() chain captures the cutoff and returns []
// (so the prune step is observable but doesn't actually delete anything).
vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => []),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(async () => [{ n: 0 }]),
    })),
  }),
  schema: {},
}));

vi.mock('@hamafx/db/schema', () => ({
  candles1m: { t: 't', symbol: 'symbol' },
}));

import * as ai from '@hamafx/ai';
import * as data from '@hamafx/data';

import { runSnapshots } from '../src/jobs/snapshots';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });

beforeEach(() => {
  vi.mocked(ai.computeDailySnapshot).mockReset();
  vi.mocked(ai.upsertSnapshot).mockReset();
  vi.mocked(data.getCandles).mockReset();
});

describe('runSnapshots', () => {
  it('processes every supported symbol and tail-prunes candles_1m', async () => {
    vi.mocked(data.getCandles).mockResolvedValue([] as never);
    vi.mocked(ai.computeDailySnapshot).mockReturnValue({} as never);
    vi.mocked(ai.upsertSnapshot).mockResolvedValue(undefined as never);

    const r = await runSnapshots({ log });
    expect(r.processed).toBe(3); // XAUUSD, EURUSD, GBPUSD
    expect(r.note).toMatch(/symbols=3\/3/);
    expect(r.note).toMatch(/pruned=0/);
    expect(r.note).toMatch(/candles_1m_total=0/);
    expect(data.getCandles).toHaveBeenCalledTimes(3);
    expect(ai.upsertSnapshot).toHaveBeenCalledTimes(3);
  });

  it('counts errors but keeps going', async () => {
    vi.mocked(data.getCandles)
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(ai.computeDailySnapshot).mockReturnValue({} as never);
    vi.mocked(ai.upsertSnapshot).mockResolvedValue(undefined as never);

    const r = await runSnapshots({ log });
    expect(r.processed).toBe(2);
    expect(r.note).toMatch(/symbols=2\/3/);
    expect(r.note).toMatch(/errors=1/);
  });
});
