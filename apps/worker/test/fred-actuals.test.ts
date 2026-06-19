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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/ai', () => ({
  listFredEventsMissingActual: vi.fn(),
  parseFredEventId: vi.fn(),
  patchEventActual: vi.fn(),
}));

// Phase 3 hardening §19 — `apps/worker/src/jobs/fred-actuals.ts` now
// imports the FRED helpers via `import { fred } from '@hamafx/data'`
// instead of the deep `@hamafx/data/providers/fred` path. Match the
// new import shape so vitest's module resolver finds the mock.
vi.mock('@hamafx/data', () => ({
  fred: {
    fetchObservations: vi.fn(),
    fredMeta: vi.fn(),
  },
}));

import * as ai from '@hamafx/ai';
import { fred } from '@hamafx/data';

import { runFredActuals } from '../src/jobs/fred-actuals';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });
const ORIGINAL_FRED_KEY = process.env['FRED_API_KEY'];

beforeEach(() => {
  process.env['FRED_API_KEY'] = 'test-key';
  vi.mocked(ai.listFredEventsMissingActual).mockReset();
  vi.mocked(ai.parseFredEventId).mockReset();
  vi.mocked(ai.patchEventActual).mockReset();
  vi.mocked(fred.fetchObservations).mockReset();
  vi.mocked(fred.fredMeta).mockReset();
});

afterEach(() => {
  if (ORIGINAL_FRED_KEY === undefined) delete process.env['FRED_API_KEY'];
  else process.env['FRED_API_KEY'] = ORIGINAL_FRED_KEY;
});

describe('runFredActuals', () => {
  it('short-circuits when FRED_API_KEY is missing', async () => {
    delete process.env['FRED_API_KEY'];
    vi.mocked(ai.listFredEventsMissingActual).mockResolvedValue([{ id: 'fred:50:2026-05-01' } as never]);

    const r = await runFredActuals({ log });
    expect(r.processed).toBe(0);
    expect(r.note).toBe('FRED_API_KEY missing');
    expect(ai.listFredEventsMissingActual).not.toHaveBeenCalled();
  });

  it('patches each candidate with the closest observation', async () => {
    vi.mocked(ai.listFredEventsMissingActual).mockResolvedValue([
      { id: 'fred:50:2026-05-01' } as never,
      { id: 'fred:51:2026-05-15' } as never,
    ]);
    vi.mocked(ai.parseFredEventId).mockImplementation((id: string) =>
      id === 'fred:50:2026-05-01'
        ? { releaseId: 50, releaseDate: '2026-05-01' }
        : { releaseId: 51, releaseDate: '2026-05-15' },
    );
    vi.mocked(fred.fredMeta).mockReturnValue({
      seriesId: 'PAYEMS',
      title: 'NFP',
      importance: 'high',
    } as never);
    vi.mocked(fred.fetchObservations).mockResolvedValue([
      { date: '2026-05-02', value: 200_000 } as never,
      { date: '2026-05-04', value: 150_000 } as never,
    ]);
    vi.mocked(ai.patchEventActual).mockResolvedValue(undefined as never);

    const r = await runFredActuals({ log });
    expect(r.processed).toBe(2);
    expect(r.note).toMatch(/filled=2/);
    expect(ai.patchEventActual).toHaveBeenCalledWith(
      'fred:50:2026-05-01',
      200_000,
      expect.any(Date),
    );
  });

  it('skips rows with un-parseable ids and missing meta', async () => {
    vi.mocked(ai.listFredEventsMissingActual).mockResolvedValue([
      { id: 'fred:50:2026-05-01' } as never,
      { id: 'malformed' } as never,
    ]);
    vi.mocked(ai.parseFredEventId).mockImplementation((id: string) =>
      id === 'malformed' ? null : { releaseId: 50, releaseDate: '2026-05-01' },
    );
    // First call returns a meta with seriesId, but we want to test the
    // missing-meta branch — skip seriesId.
    vi.mocked(fred.fredMeta).mockReturnValue(null);

    const r = await runFredActuals({ log });
    expect(r.note).toMatch(/skipped=2/);
  });
});
