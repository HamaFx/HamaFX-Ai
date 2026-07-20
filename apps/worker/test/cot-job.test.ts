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

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/ai', () => ({
  upsertCoTReport: vi.fn(),
}));

// Phase 3 hardening §19 — `apps/worker/src/jobs/cot.ts` now imports
// the CFTC helpers via `import { cftc } from '@hamafx/data'`. Match
// the new namespace shape so vitest's module resolver finds the mock.
vi.mock('@hamafx/data', () => ({
  cftc: {
    fetchLatestRows: vi.fn(),
    parseCftcInt: (s: string | undefined) =>
      s == null || s === '' ? null : Number.parseInt(s, 10),
    toCftcName: (s: string) => `cftc:${s}`,
  },
}));

import * as ai from '@hamafx/ai';
import { cftc } from '@hamafx/data';

import { runCoT } from '../src/jobs/cot';
import { TenantRouter } from '../src/tenant-router';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

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

    const r = await runCoT({ log, signal: new AbortController().signal, tenantRouter: testRouter });
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

    const r = await runCoT({ log, signal: new AbortController().signal, tenantRouter: testRouter });
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

    await runCoT({ log, signal: new AbortController().signal, tenantRouter: testRouter });
    // 3 symbols × 1 valid row each
    expect(ai.upsertCoTReport).toHaveBeenCalledTimes(3);
  });
});
