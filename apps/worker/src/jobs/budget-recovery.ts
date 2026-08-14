/**
 * Copyright 2026 Kestrel
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

// Phase 4 — recover budget reservations left open by crashed AI turns.

import { recoverStaleBudgetReservations } from '@kestrel/ai';

import type { JobContext, JobResult } from './types.js';

const RESERVATION_STALE_MS = 15 * 60 * 1000;
const RECOVERY_BATCH_SIZE = 100;

export async function runBudgetRecovery(ctx: JobContext): Promise<JobResult> {
  const cutoff = new Date(Date.now() - RESERVATION_STALE_MS);
  const result = await recoverStaleBudgetReservations(cutoff, RECOVERY_BATCH_SIZE);

  if (result.scanned > 0 || result.failed > 0) {
    ctx.log.warn('budget reservation recovery completed', {
      cutoff: cutoff.toISOString(),
      scanned: result.scanned,
      released: result.released,
      failed: result.failed,
    });
  } else {
    ctx.log.info('budget reservation recovery found no stale reservations');
  }

  return {
    processed: result.released,
    note: `scanned=${result.scanned} released=${result.released} failed=${result.failed}`,
  };
}
