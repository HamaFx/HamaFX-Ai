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

// Snapshot persistence — upsert + read helpers for the `snapshots` table.
//
// Composite uniqueness is `(symbol, kind, as_of)`; the table doesn't enforce
// this with a unique constraint at the migration level (the index is
// non-unique), so we use a select-then-update fallback when ON CONFLICT
// can't fire. For Phase 2's volume (3 symbols × 1 kind × 1/day) this is
// fine — we never have duplicate rows in practice.

import { getDb, schema } from '@hamafx/db';
import type { Symbol } from '@hamafx/shared';
import { and, desc, eq } from 'drizzle-orm';

export interface SnapshotRow<TData = Record<string, unknown>> {
  id: string;
  symbol: Symbol;
  kind: string;
  asOf: number;
  data: TData;
  createdAt: number;
}

export interface UpsertSnapshotArgs<TData> {
  symbol: Symbol;
  kind: string;
  asOf: Date;
  data: TData;
}

/**
 * Upsert a snapshot row. Idempotent on the `snapshots_symbol_kind_asof_uk`
 * UNIQUE constraint (Phase 3 §15). Uses ON CONFLICT DO UPDATE so even
 * when the cron lock is bypassed (DB unavailable during acquireCronLock),
 * concurrent inserts for the same (symbol, kind, asOf) triplet are safe —
 * the second one updates instead of creating a duplicate (H2 fix).
 */
export async function upsertSnapshot<TData>(args: UpsertSnapshotArgs<TData>): Promise<void> {
  const { symbol, kind, asOf, data } = args;
  await getDb()
    .insert(schema.snapshots)
    .values({ symbol, kind, asOf, data: data as Record<string, unknown> })
    .onConflictDoUpdate({
      target: [schema.snapshots.symbol, schema.snapshots.kind, schema.snapshots.asOf],
      set: { data: data as Record<string, unknown> },
    });
}

/**
 * Most-recent snapshot for `(symbol, kind)`. Returns `null` when the table
 * has no row matching the predicate — every consumer SHALL fall back to
 * on-demand computation in that case (Requirement 6.6).
 */
export async function getLatestSnapshot<TData = Record<string, unknown>>(
  symbol: Symbol,
  kind = 'daily',
): Promise<SnapshotRow<TData> | null> {
  const rows = await getDb()
    .select()
    .from(schema.snapshots)
    .where(and(eq(schema.snapshots.symbol, symbol), eq(schema.snapshots.kind, kind)))
    .orderBy(desc(schema.snapshots.asOf))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol as Symbol,
    kind: row.kind,
    asOf: row.asOf.getTime(),
    data: row.data as TData,
    createdAt: row.createdAt.getTime(),
  };
}
