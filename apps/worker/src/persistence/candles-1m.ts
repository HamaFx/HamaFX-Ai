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

// `candles_1m` writer. Inserts a closed 1-minute bar; idempotent on
// (symbol, t) so worker restarts that re-emit the same bar are safe.
//
// The aggregator drives this via `onClosed`, so writes happen exactly
// once per closed bar — no batching needed. If we ever want batched
// writes (e.g. to amortize Postgres round-trips during weekend gap
// catch-up) we add a small buffer here.

import type { getDb } from '@hamafx/db';
import { candles1m } from '@hamafx/db/schema';

import type { ClosedCandle } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';

export interface FlushClosedCandleArgs {
  db: ReturnType<typeof getDb>;
  log: Logger;
  bar: ClosedCandle;
}

/**
 * Persist a single closed 1m bar. Returns silently on success; bubbles up
 * any DB error so the caller decides whether to retry or log + skip.
 */
export async function flushClosedCandle(args: FlushClosedCandleArgs): Promise<void> {
  const { bar } = args;
  await args.db
    .insert(candles1m)
    .values({
      symbol: bar.symbol,
      t: new Date(bar.t),
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      v: bar.v,
      tickVolume: bar.tickVolume,
      source: bar.source,
    })
    .onConflictDoNothing();
}
