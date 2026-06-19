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

// Share-snapshot persistence.
//
// The `share_snapshot` tool inserts a row, then signs an HMAC token of
// `(id, expiresAt)` using `AUTH_COOKIE_SECRET`. The public read route
// at `/share/[id]` verifies the token, looks up the row by id, and
// renders title + body + (optional) overlay.

import { getDb, schema } from '@hamafx/db';
import type { AnnotateChartOutput, Symbol, Timeframe } from '@hamafx/shared';
import { eq } from 'drizzle-orm';

export interface CreateSnapshotArgs {
  userId: string;
  title: string;
  body: string;
  overlay?: AnnotateChartOutput | undefined;
  symbol?: Symbol | undefined;
  tf?: Timeframe | undefined;
  expiresAt: Date;
}

export interface SnapshotRow {
  id: string;
  title: string;
  body: string;
  overlay: AnnotateChartOutput | null;
  symbol: Symbol | null;
  tf: Timeframe | null;
  expiresAt: number;
  createdAt: number;
}

function rowToSnapshot(row: typeof schema.sharedSnapshots.$inferSelect): SnapshotRow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    overlay: (row.overlay as AnnotateChartOutput | null) ?? null,
    symbol: row.symbol as Symbol | null,
    tf: row.tf as Timeframe | null,
    expiresAt: row.expiresAt.getTime(),
    createdAt: row.createdAt.getTime(),
  };
}

export async function createSnapshot(args: CreateSnapshotArgs): Promise<SnapshotRow> {
  const inserted = await getDb()
    .insert(schema.sharedSnapshots)
    .values({
      userId: args.userId,
      title: args.title,
      body: args.body,
      overlay: (args.overlay ?? null) as Record<string, unknown> | null,
      symbol: args.symbol ?? null,
      tf: args.tf ?? null,
      expiresAt: args.expiresAt,
    })
    .returning();
  return rowToSnapshot(inserted[0]!);
}

export async function getSnapshot(id: string): Promise<SnapshotRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.sharedSnapshots)
    .where(eq(schema.sharedSnapshots.id, id))
    .limit(1);
  const r = rows[0];
  return r ? rowToSnapshot(r) : null;
}

/** Read a snapshot only when it's still inside its expiry window. */
export async function getActiveSnapshot(id: string): Promise<SnapshotRow | null> {
  const row = await getSnapshot(id);
  if (!row) return null;
  if (row.expiresAt < Date.now()) return null;
  return row;
}
