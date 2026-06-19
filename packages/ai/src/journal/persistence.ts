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

// Journal CRUD + stats. Single user, no per-user filter.
//
// Stats math: realized R-multiple is computed at close time via
// `computeRMultiple(entry, stop, exit, side)` so the column is reliable.
// Open trades have rMultiple=null and don't contribute to avgR/winRate.
//
// Phase 7b: every successful create / update fires a best-effort
// re-embedding of the entry into the memory index so `search_knowledge`
// can recall journal context. The memory call is fire-and-forget — the
// CRUD response never waits on it.

import { getDb, schema } from '@hamafx/db';
import {
  JournalEntrySchema,
  SymbolSchema,
  TradeOutcomeSchema,
  TradeSideSchema,
  type JournalEntry,
  type JournalStats,
  type Symbol,
  type TradeOutcome,
  type TradeSide,
} from '@hamafx/shared';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';

import { rememberJournalEntry } from '../memory/memory-index';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateJournalInput {
  symbol: Symbol;
  side: TradeSide;
  openedAt: number;
  entry: number;
  stop?: number | null;
  target?: number | null;
  size?: number | null;
  notes?: string | null;
  tags?: string[];
  userId: string;
}

export async function listEntries(
  userId: string,
  opts: { limit?: number; symbol?: Symbol } = {},
): Promise<JournalEntry[]> {
  const filters = [eq(schema.journalEntries.userId, userId)];
  if (opts.symbol) filters.push(eq(schema.journalEntries.symbol, opts.symbol));

  const rows = await getDb()
    .select()
    .from(schema.journalEntries)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(schema.journalEntries.openedAt))
    .limit(opts.limit ?? 100);

  return rows.map(rowToEntry);
}

export async function getEntry(userId: string, id: string): Promise<JournalEntry | null> {
  const rows = await getDb()
    .select()
    .from(schema.journalEntries)
    .where(and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId)))
    .limit(1);
  const row = rows[0];
  return row ? rowToEntry(row) : null;
}

export async function createEntry(input: CreateJournalInput): Promise<JournalEntry> {
  const symbol = SymbolSchema.parse(input.symbol);
  const side = TradeSideSchema.parse(input.side);

  const inserted = await getDb()
    .insert(schema.journalEntries)
    .values({
      userId: input.userId,
      symbol,
      side,
      openedAt: new Date(input.openedAt),
      entry: input.entry,
      stop: input.stop ?? null,
      target: input.target ?? null,
      size: input.size ?? null,
      outcome: 'open',
      notes: input.notes ?? null,
      tags: input.tags ?? [],
    })
    .returning();
  const entry = rowToEntry(inserted[0]!);

  // Best-effort memory write so `search_knowledge` can recall this trade.
  // Errors here must never block the journal-CRUD response.
  void rememberJournalEntry({ entryId: entry.id }).catch((err) => {
    console.warn('[journal] memory upsert failed', err);
  });

  return entry;
}

export interface UpdateJournalInput {
  closedAt?: number | null | undefined;
  exit?: number | null | undefined;
  stop?: number | null | undefined;
  target?: number | null | undefined;
  size?: number | null | undefined;
  outcome?: TradeOutcome | undefined;
  notes?: string | null | undefined;
  tags?: string[] | undefined;
}

export async function updateEntry(
  userId: string,
  id: string,
  input: UpdateJournalInput,
): Promise<JournalEntry | null> {
  const existing = await getEntry(userId, id);
  if (!existing) return null;

  const patch: Partial<typeof schema.journalEntries.$inferInsert> = {};

  if (input.closedAt !== undefined) {
    patch.closedAt = input.closedAt === null ? null : new Date(input.closedAt);
  }
  if (input.exit !== undefined) patch.exit = input.exit;
  if (input.stop !== undefined) patch.stop = input.stop;
  if (input.target !== undefined) patch.target = input.target;
  if (input.size !== undefined) patch.size = input.size;
  if (input.outcome !== undefined) patch.outcome = TradeOutcomeSchema.parse(input.outcome);
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.tags !== undefined) patch.tags = input.tags;

  // Auto-compute outcome + rMultiple when we have enough data.
  const exit = input.exit ?? existing.exit;
  const stop = input.stop ?? existing.stop;
  const closedAt = (input.closedAt ?? existing.closedAt) as number | null;
  if (exit !== null && stop !== null && closedAt !== null) {
    const r = computeRMultiple({
      side: existing.side,
      entry: existing.entry,
      stop,
      exit,
    });
    patch.rMultiple = r;
    if (input.outcome === undefined) {
      patch.outcome = r > 0.05 ? 'win' : r < -0.05 ? 'loss' : 'breakeven';
    }
  }

  const updated = await getDb()
    .update(schema.journalEntries)
    .set(patch)
    .where(and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId)))
    .returning();
  if (!updated[0]) return null;
  const entry = rowToEntry(updated[0]);

  // Re-embed: outcomes and notes change the natural-language summary
  // we feed the memory index, so a stale row would mislead recall.
  void rememberJournalEntry({ entryId: entry.id }).catch((err) => {
    console.warn('[journal] memory upsert failed', err);
  });

  return entry;
}

export async function deleteEntry(userId: string, id: string): Promise<void> {
  await getDb().delete(schema.journalEntries).where(and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId)));
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * R-multiple = (exit - entry) / |entry - stop|, signed by direction.
 * For longs: positive when exit > entry. For shorts: positive when exit < entry.
 */
export function computeRMultiple(args: {
  side: TradeSide;
  entry: number;
  stop: number;
  exit: number;
}): number {
  const risk = Math.abs(args.entry - args.stop);
  if (risk === 0) return 0;
  const reward = args.side === 'long' ? args.exit - args.entry : args.entry - args.exit;
  return reward / risk;
}

export function summarize(entries: JournalEntry[]): JournalStats {
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let open = 0;
  let totalR = 0;
  let countWithR = 0;

  for (const e of entries) {
    if (e.outcome === 'open') {
      open += 1;
      continue;
    }
    if (e.outcome === 'win') wins += 1;
    else if (e.outcome === 'loss') losses += 1;
    else breakevens += 1;
    if (e.rMultiple !== null) {
      totalR += e.rMultiple;
      countWithR += 1;
    }
  }

  const closed = wins + losses + breakevens;
  const winRate = closed === 0 ? 0 : wins / closed;
  const avgR = countWithR === 0 ? 0 : totalR / countWithR;

  return {
    count: entries.length,
    wins,
    losses,
    breakevens,
    open,
    winRate,
    avgR,
    totalR,
  };
}

export async function computeStats(
  userId: string,
  opts: { sinceMs?: number; untilMs?: number } = {},
): Promise<JournalStats> {
  const filters = [eq(schema.journalEntries.userId, userId)];
  if (opts.sinceMs !== undefined)
    filters.push(gte(schema.journalEntries.openedAt, new Date(opts.sinceMs)));
  if (opts.untilMs !== undefined)
    filters.push(lte(schema.journalEntries.openedAt, new Date(opts.untilMs)));

  const rows = await getDb()
    .select()
    .from(schema.journalEntries)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(schema.journalEntries.openedAt));
  return summarize(rows.map(rowToEntry));
}

// ---------------------------------------------------------------------------
// Row → DTO
// ---------------------------------------------------------------------------

function rowToEntry(row: typeof schema.journalEntries.$inferSelect): JournalEntry {
  return JournalEntrySchema.parse({
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    openedAt: row.openedAt.getTime(),
    closedAt: row.closedAt ? row.closedAt.getTime() : null,
    entry: row.entry,
    stop: row.stop,
    target: row.target,
    exit: row.exit,
    size: row.size,
    outcome: row.outcome,
    rMultiple: row.rMultiple,
    notes: row.notes,
    tags: row.tags ?? [],
    attachments: row.attachments ?? [],
    userId: row.userId,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });
}
