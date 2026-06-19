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

// Phase 8 PR-11 — `snapshots` heavy job, migrated from
// /api/cron/snapshots on Vercel (route stays as manual fallback).
//
// Computes a fresh "daily" snapshot per supported symbol (HLOC + pivots
// + ATR + key levels) from a 240-bar 1H window, and upserts the row
// into `snapshots`. Reruns are idempotent on (symbol, kind, asOf).
//
// Tail step: prune candles_1m to the trailing 14 days. The aggregator
// writes one row per minute per symbol; left unbounded the table grows
// ~4 MB/month — we don't need it to. (Spec §4.3 retention.)

import { computeDailySnapshot, previousUtcMidnight, upsertSnapshot } from '@hamafx/ai';
import { getCandles } from '@hamafx/data';
import { getDb } from '@hamafx/db';
import { candles1m } from '@hamafx/db/schema';
import { SYMBOLS } from '@hamafx/shared';
import { lt, sql } from 'drizzle-orm';

import type { JobContext, JobResult } from './types.js';

const SOURCE_TF = '1h' as const;
const SOURCE_COUNT = 240; // ~10 days of 1H bars; covers ATR14 + PDH/PDL.

/** Hold candles_1m to 14 trailing days. Spec §4.3. */
const CANDLES_RETENTION_DAYS = 14;

export async function runSnapshots(ctx: JobContext): Promise<JobResult> {
  const log = ctx.log;
  const asOf = previousUtcMidnight();
  let processed = 0;
  const errors: Array<{ symbol: string; message: string }> = [];

  for (const symbol of SYMBOLS) {
    if (ctx.signal?.aborted) {
      log.warn('snapshots aborted mid-loop', { processed, remaining: SYMBOLS.length - processed });
      break;
    }
    try {
      const candles = await getCandles(symbol, SOURCE_TF, { count: SOURCE_COUNT });
      const data = computeDailySnapshot({ candles, asOf });
      await upsertSnapshot({ symbol, kind: 'daily', asOf, data });
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ symbol, message });
      log.error('snapshot failed', { symbol, err: message });
    }
  }

  // Tail step — prune candles_1m beyond the retention window. Cheap
  // enough to run synchronously after the snapshot loop.
  let pruned = 0;
  try {
    const cutoff = new Date(Date.now() - CANDLES_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await getDb()
      .delete(candles1m)
      .where(lt(candles1m.t, cutoff))
      .returning({ symbol: candles1m.symbol });
    pruned = result.length;
    log.info('candles_1m prune complete', { cutoff: cutoff.toISOString(), pruned });
  } catch (err) {
    log.error('candles_1m prune failed', { err: String(err) });
  }

  // Round-trip: a `count(*)` would be nicer but the .returning above is
  // already authoritative — log a sanity row count from a fast query.
  let total = 0;
  try {
    const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(candles1m);
    total = row?.n ?? 0;
  } catch {
    /* best-effort */
  }

  return {
    processed,
    note: `symbols=${processed}/${SYMBOLS.length} errors=${errors.length} pruned=${pruned} candles_1m_total=${total}`,
  };
}
