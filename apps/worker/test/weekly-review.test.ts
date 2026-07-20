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
  emitWeeklyReview: vi.fn(),
}));

// One user — matches the per-user loop in the new multi-user source.
vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({
      from: vi.fn(async () => [{ id: 'u1' }]),
    })),
  }),
  schema: { users: { id: 'id' } },
  getActiveUserIds: vi.fn(async () => ['u1']),
}));

import * as ai from '@hamafx/ai';

import { runWeeklyReview } from '../src/jobs/weekly-review';
import { TenantRouter } from '../src/tenant-router';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();

beforeEach(() => {
  vi.mocked(ai.emitWeeklyReview).mockReset();
});

describe('runWeeklyReview', () => {
  it('returns processed=1 when emitWeeklyReview emitted', async () => {
    vi.mocked(ai.emitWeeklyReview).mockResolvedValue({ emitted: true });
    const r = await runWeeklyReview({ log, signal: new AbortController().signal, tenantRouter: testRouter });
    expect(r.processed).toBe(1);
    expect(r.note).toBeUndefined();
  });

  it('returns processed=0 when all users already have this week\'s review', async () => {
    // Phase A (multi-user): the job now loops per-user. The per-user
    // 'already-emitted' reason is logged at error level instead of being
    // propagated to the aggregated JobResult, so `note` is undefined.
    vi.mocked(ai.emitWeeklyReview).mockResolvedValue({
      emitted: false,
      reason: 'already-emitted',
    });
    const r = await runWeeklyReview({ log, signal: new AbortController().signal, tenantRouter: testRouter });
    expect(r.processed).toBe(0);
    expect(r.note).toBeUndefined();
  });
});
