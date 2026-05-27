import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/ai', () => ({
  upsertCoTReport: vi.fn(),
}));

vi.mock('@hamafx/data/providers/cftc', () => ({
  fetchLatestRows: vi.fn(),
  parseCftcInt: (s: string | undefined) => (s == null || s === '' ? null : Number.parseInt(s, 10)),
  toCftcName: (s: string) => `cftc:${s}`,
}));

import * as ai from '@hamafx/ai';
import * as cftc from '@hamafx/data/providers/cftc';

import { runCoT } from '../src/jobs/cot';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });

beforeEach(() => {
  vi.mocked(ai.upsertCoTReport).mockReset();
  vi.mocked(cftc.fetchLatestRows).mockReset();
});

const SAMPLE_ROW = {
  report_date_as_yyyy_mm_dd: '2026-05-23',
  dealer_positions_long_all: '100',
  dealer_positions_short_all: '50',
  asset_mgr_positions_long_all: '80',
  asset_mgr_positions_short_all: '40',
  lev_money_positions_long_all: '70',
  lev_money_positions_short_all: '30',
  other_rept_positions_long_all: '20',
  other_rept_positions_short_all: '10',
} as never;

describe('runCoT', () => {
  it('iterates supported symbols, upserts each row, and reports counts', async () => {
    vi.mocked(cftc.fetchLatestRows).mockResolvedValue([SAMPLE_ROW, SAMPLE_ROW]);
    vi.mocked(ai.upsertCoTReport).mockResolvedValue(undefined as never);

    const r = await runCoT({ log });
    // 3 supported symbols × 2 rows = 6 upserts; processed = symbols handled
    expect(r.processed).toBe(3);
    expect(r.note).toMatch(/upserted=6/);
    expect(ai.upsertCoTReport).toHaveBeenCalledTimes(6);
  });

  it('continues past per-symbol failures', async () => {
    vi.mocked(cftc.fetchLatestRows)
      .mockRejectedValueOnce(new Error('cftc down'))
      .mockResolvedValueOnce([SAMPLE_ROW])
      .mockResolvedValueOnce([SAMPLE_ROW]);
    vi.mocked(ai.upsertCoTReport).mockResolvedValue(undefined as never);

    const r = await runCoT({ log });
    expect(r.processed).toBe(2);
    expect(r.note).toMatch(/errors=1/);
  });

  it('skips rows whose report_date_as_yyyy_mm_dd is malformed', async () => {
    const bad = { ...(SAMPLE_ROW as Record<string, unknown>), report_date_as_yyyy_mm_dd: '' };
    vi.mocked(cftc.fetchLatestRows).mockResolvedValue([
      bad as never,
      SAMPLE_ROW,
    ] as never);
    vi.mocked(ai.upsertCoTReport).mockResolvedValue(undefined as never);

    await runCoT({ log });
    // 3 symbols × 1 valid row each
    expect(ai.upsertCoTReport).toHaveBeenCalledTimes(3);
  });
});
