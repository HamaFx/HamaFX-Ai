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
 * Upsert a snapshot row. Idempotent on `(symbol, kind, asOf)`: if a row
 * already exists for the same triplet we update its `data`; otherwise we
 * insert. Drizzle has no `onConflict` for non-unique columns so we do the
 * lookup ourselves.
 */
export async function upsertSnapshot<TData>(args: UpsertSnapshotArgs<TData>): Promise<void> {
  const { symbol, kind, asOf, data } = args;
  // Phase 1 hardening §9 — wrap the lookup + write in one transaction.
  // The pre-fix code was vulnerable to a "lost upsert" race where two
  // concurrent callers both read no-row, both inserted, and the table
  // ended up with duplicate rows for the same (symbol, kind, asOf).
  // Postgres serialises the SELECT … FOR UPDATE inside the transaction
  // so the write side is consistent.
  await getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ id: schema.snapshots.id })
      .from(schema.snapshots)
      .where(
        and(
          eq(schema.snapshots.symbol, symbol),
          eq(schema.snapshots.kind, kind),
          eq(schema.snapshots.asOf, asOf),
        ),
      )
      .for('update')
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      await tx
        .update(schema.snapshots)
        .set({ data: data as Record<string, unknown> })
        .where(eq(schema.snapshots.id, existing[0].id));
      return;
    }
    await tx
      .insert(schema.snapshots)
      .values({ symbol, kind, asOf, data: data as Record<string, unknown> });
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
