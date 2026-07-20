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

// Tests for the embedding-backfill worker job. We mock @hamafx/ai's
// backfillEmbeddings + countPendingEmbeddings to avoid hitting the AI
// Gateway / Postgres.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/ai', () => ({
  backfillEmbeddings: vi.fn(),
  countPendingEmbeddings: vi.fn(),
}));

import * as ai from '@hamafx/ai';

import { runEmbeddingBackfill } from '../src/jobs/embedding-backfill';
import { TenantRouter } from '../src/tenant-router';
import { createLogger } from '../src/log';

const log = createLogger({ service: 'test', forceJson: true });
const testRouter = new TenantRouter();
const ctx = { log, signal: new AbortController().signal, tenantRouter: testRouter };

beforeEach(() => {
  vi.mocked(ai.backfillEmbeddings).mockReset();
  vi.mocked(ai.countPendingEmbeddings).mockReset();
});

describe('runEmbeddingBackfill', () => {
  it('short-circuits when there is nothing to embed', async () => {
    vi.mocked(ai.countPendingEmbeddings).mockResolvedValue(0);

    const r = await runEmbeddingBackfill(ctx);
    expect(r.processed).toBe(0);
    expect(r.note).toBe('pending=0, skipped');
    expect(ai.backfillEmbeddings).not.toHaveBeenCalled();
  });

  it('runs backfill and returns processed + diff in note', async () => {
    vi.mocked(ai.countPendingEmbeddings)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(0);
    vi.mocked(ai.backfillEmbeddings).mockResolvedValue({
      embedded: 50,
      batches: 2,
      totalTokens: 1234,
    });

    const r = await runEmbeddingBackfill(ctx);
    expect(r.processed).toBe(50);
    expect(r.note).toBe('pending: 50->0, batches=2, tokens=1234');
    expect(ai.backfillEmbeddings).toHaveBeenCalledTimes(1);

    const args = vi.mocked(ai.backfillEmbeddings).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(args?.['batchSize']).toBe(32);
    // Phase 8 cap: 1024 rows per run, up from the Vercel-bound 256.
    expect(args?.['maxRows']).toBe(1024);
  });

  it('forwards an AbortSignal so SIGTERM during a run can short-circuit', async () => {
    vi.mocked(ai.countPendingEmbeddings).mockResolvedValue(50);
    vi.mocked(ai.backfillEmbeddings).mockResolvedValue({
      embedded: 50,
      batches: 2,
      totalTokens: 100,
    });

    const ac = new AbortController();
    await runEmbeddingBackfill({ log, signal: ac.signal, tenantRouter: testRouter });

    const args = vi.mocked(ai.backfillEmbeddings).mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(args?.['signal']).toBe(ac.signal);
  });
});
