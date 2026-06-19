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

// Phase 8 PR-9 — `embedding-backfill` heavy job, migrated from
// /api/cron/embedding-backfill on Vercel (which stays in place as a
// manual-fallback route, see plan §8 PR-9).
//
// Why move it: the Vercel route was the closest one to the 60 s function
// ceiling. Embedding 256 rows × ~150 ms/row burns most of the budget on
// the AI Gateway round-trips. On the worker the same code runs without a
// time cap (systemd kills only on 10 min — see hamafx-job-embedding-backfill.timer
// in PR-15).
//
// We import the existing `backfillEmbeddings` from @hamafx/ai unchanged —
// the implementation is correct; we only relocate where it runs.

import { backfillEmbeddings, countPendingEmbeddings } from '@hamafx/ai';

import type { JobContext, JobResult } from './types.js';

/** Single source of truth for cap math. Bumped from the Vercel limit (256). */
const MAX_ROWS_PER_RUN = 1024;
const BATCH_SIZE = 32;

export async function runEmbeddingBackfill(ctx: JobContext): Promise<JobResult> {
  const before = await countPendingEmbeddings();
  if (before === 0) {
    return { processed: 0, note: 'pending=0, skipped' };
  }

  ctx.log.info('embedding-backfill start', { pending: before });
  const result = await backfillEmbeddings({
    batchSize: BATCH_SIZE,
    maxRows: MAX_ROWS_PER_RUN,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  const after = await countPendingEmbeddings();

  ctx.log.info('embedding-backfill complete', {
    embedded: result.embedded,
    batches: result.batches,
    tokens: result.totalTokens,
    pending: after,
  });

  return {
    processed: result.embedded,
    note: `pending: ${before}->${after}, batches=${result.batches}, tokens=${result.totalTokens}`,
  };
}
