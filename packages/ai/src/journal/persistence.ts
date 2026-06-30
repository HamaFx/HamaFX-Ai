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
  screenshotUrl?: string | null;
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
      screenshotUrl: input.screenshotUrl ?? null,
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

export async function deleteEntry(userId: string, id: string): Promise<boolean> {
  const result = await getDb()
    .delete(schema.journalEntries)
    .where(and(eq(schema.journalEntries.id, id), eq(schema.journalEntries.userId, userId)))
    .returning({ id: schema.journalEntries.id });
  return result.length > 0;
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

  // Phase B — UX_UPGRADE_PLAN.md item 13.
  // Trackers for the extended metrics. Initialised to safe defaults
  // so the legacy return shape (without the optional fields) is
  // preserved when entries is empty.
  let sumWinningR = 0;
  let sumLosingR = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let currentStreak: 'win' | 'loss' | null = null;
  let currentStreakLen = 0;
  let totalHoldMs = 0;
  let holdCount = 0;

  // Per-day-of-week: count entries whose closedAt falls on each
  // weekday. Sunday = 0 in JS Date.getDay(). We use closedAt when
  // available, otherwise fall back to openedAt so the chart still
  // has data for trades that are still open.
  const perDow = {
    sunday: 0,
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
  };

  // Max drawdown: walk entries in time order, accumulate a peak,
  // track the largest (peak − current) drop.
  const ordered = [...entries].sort((a, b) => a.openedAt - b.openedAt);
  let cumulativeR = 0;
  let peakR = 0;
  let maxDrawdown = 0;

  // Phase 2 — rich analytics accumulators.
  const bySymbolMap = new Map<
    string,
    { trades: number; wins: number; totalR: number }
  >();
  const byHourMap = new Map<number, { trades: number; wins: number; totalR: number }>();
  const byDowMap = new Map<string, { trades: number; wins: number; totalR: number }>();
  const byTagMap = new Map<string, { trades: number; wins: number; totalR: number }>();
  const rDistributionBuckets = [
    { bucket: '[-3,-2)', min: -3, max: -2, count: 0 },
    { bucket: '[-2,-1)', min: -2, max: -1, count: 0 },
    { bucket: '[-1,0)', min: -1, max: 0, count: 0 },
    { bucket: '[0,0]', min: 0, max: 0, count: 0 },
    { bucket: '(0,1]', min: 0, max: 1, count: 0 },
    { bucket: '(1,2]', min: 1, max: 2, count: 0 },
    { bucket: '(2,3]', min: 2, max: 3, count: 0 },
    { bucket: '[3+]', min: 3, max: Infinity, count: 0 },
  ];
  const DOW_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

  function sessionFromHour(hour: number): string {
    if (hour >= 0 && hour < 8) return 'Asian';
    if (hour >= 8 && hour < 16) return 'London';
    if (hour >= 13 && hour < 21) return 'NY';
    return 'Off';
  }

  function addToBucket(r: number) {
    for (const b of rDistributionBuckets) {
      if (b.bucket === '[0,0]') {
        if (r === 0) {
          b.count += 1;
          return;
        }
        continue;
      }
      if (b.bucket === '[3+]') {
        if (r >= b.min) {
          b.count += 1;
          return;
        }
        continue;
      }
      if (r >= b.min && r < b.max) {
        b.count += 1;
        return;
      }
    }
  }

  for (const e of ordered) {
    if (e.outcome === 'open') {
      open += 1;
      continue;
    }

    // Symbol / hour / day-of-week / tag grouping uses openedAt.
    const openedHour = new Date(e.openedAt).getUTCHours();
    const openedDow = new Date(e.openedAt).getUTCDay();
    const dowKey = DOW_KEYS[openedDow] ?? 'sunday';

    const symbolGroup = bySymbolMap.get(e.symbol) ?? { trades: 0, wins: 0, totalR: 0 };
    symbolGroup.trades += 1;
    if (e.outcome === 'win') symbolGroup.wins += 1;
    if (e.rMultiple !== null) symbolGroup.totalR += e.rMultiple;
    bySymbolMap.set(e.symbol, symbolGroup);

    const hourGroup = byHourMap.get(openedHour) ?? { trades: 0, wins: 0, totalR: 0 };
    hourGroup.trades += 1;
    if (e.outcome === 'win') hourGroup.wins += 1;
    if (e.rMultiple !== null) hourGroup.totalR += e.rMultiple;
    byHourMap.set(openedHour, hourGroup);

    const dowGroup = byDowMap.get(dowKey) ?? { trades: 0, wins: 0, totalR: 0 };
    dowGroup.trades += 1;
    if (e.outcome === 'win') dowGroup.wins += 1;
    if (e.rMultiple !== null) dowGroup.totalR += e.rMultiple;
    byDowMap.set(dowKey, dowGroup);

    for (const tag of e.tags ?? []) {
      const tagGroup = byTagMap.get(tag) ?? { trades: 0, wins: 0, totalR: 0 };
      tagGroup.trades += 1;
      if (e.outcome === 'win') tagGroup.wins += 1;
      if (e.rMultiple !== null) tagGroup.totalR += e.rMultiple;
      byTagMap.set(tag, tagGroup);
    }

    if (e.outcome === 'win') {
      wins += 1;
      if (e.rMultiple !== null) sumWinningR += e.rMultiple;
      if (currentStreak === 'win') {
        currentStreakLen += 1;
      } else {
        currentStreak = 'win';
        currentStreakLen = 1;
      }
      if (currentStreakLen > longestWinStreak) longestWinStreak = currentStreakLen;
    } else if (e.outcome === 'loss') {
      losses += 1;
      if (e.rMultiple !== null) sumLosingR += e.rMultiple;
      if (currentStreak === 'loss') {
        currentStreakLen += 1;
      } else {
        currentStreak = 'loss';
        currentStreakLen = 1;
      }
      if (currentStreakLen > longestLossStreak) longestLossStreak = currentStreakLen;
    } else {
      breakevens += 1;
      // A breakeven doesn't extend a streak in either direction.
      // It also doesn't reset — win/loss streaks continue across
      // breakevens, matching how traders typically think about it.
    }
    if (e.rMultiple !== null) {
      totalR += e.rMultiple;
      countWithR += 1;
      addToBucket(e.rMultiple);

      cumulativeR += e.rMultiple;
      if (cumulativeR > peakR) peakR = cumulativeR;
      const dd = peakR - cumulativeR;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    if (e.closedAt !== null) {
      totalHoldMs += e.closedAt - e.openedAt;
      holdCount += 1;
      const d = new Date(e.closedAt);
      const dow = d.getUTCDay();
      switch (dow) {
        case 0: perDow.sunday += 1; break;
        case 1: perDow.monday += 1; break;
        case 2: perDow.tuesday += 1; break;
        case 3: perDow.wednesday += 1; break;
        case 4: perDow.thursday += 1; break;
        case 5: perDow.friday += 1; break;
        case 6: perDow.saturday += 1; break;
      }
    }
  }

  const closed = wins + losses + breakevens;
  const winRate = closed === 0 ? 0 : wins / closed;
  const avgR = countWithR === 0 ? 0 : totalR / countWithR;
  const avgHoldMs = holdCount === 0 ? 0 : totalHoldMs / holdCount;
  // Profit factor: gross wins / |gross losses|. Return null when
  // there are no losses (Infinity is not meaningful in the UI).
  const profitFactor: number | null =
    sumLosingR === 0
      ? sumWinningR > 0
        ? null
        : 0
      : sumWinningR / Math.abs(sumLosingR);

  const avgWinR = wins === 0 ? 0 : sumWinningR / wins;
  const avgLossR = losses === 0 ? 0 : sumLosingR / losses;
  const recoveryFactor = maxDrawdown === 0 ? 0 : totalR / maxDrawdown;

  // Current streak: if no closed trades, none. Otherwise reflect the
  // active streak at the end of the ordered walk.
  const currentStreakOut: JournalStats['currentStreak'] =
    closed === 0
      ? { type: 'none', count: 0 }
      : currentStreak === null
        ? { type: 'none', count: 0 }
        : { type: currentStreak, count: currentStreakLen };

  // Build by-session from by-hour.
  const sessionGroups = new Map<string, { trades: number; wins: number; totalR: number }>();
  for (const [hour, group] of byHourMap) {
    const session = sessionFromHour(hour);
    const existing = sessionGroups.get(session) ?? { trades: 0, wins: 0, totalR: 0 };
    existing.trades += group.trades;
    existing.wins += group.wins;
    existing.totalR += group.totalR;
    sessionGroups.set(session, existing);
  }

  const bySymbol = Array.from(bySymbolMap.entries())
    .map(([symbol, g]) => ({
      symbol,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
      expectancy: g.trades === 0 ? 0 : g.totalR / g.trades,
    }))
    .sort((a, b) => b.totalR - a.totalR);

  const bySession = Array.from(sessionGroups.entries())
    .map(([session, g]) => ({
      session,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
    }))
    .sort((a, b) => b.totalR - a.totalR);

  const byHour = Array.from(byHourMap.entries())
    .map(([hour, g]) => ({
      hour,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
    }))
    .sort((a, b) => a.hour - b.hour);

  const byDayOfWeek = DOW_KEYS.map((day) => {
    const g = byDowMap.get(day) ?? { trades: 0, wins: 0, totalR: 0 };
    return {
      day: day.charAt(0).toUpperCase() + day.slice(1),
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
    };
  });

  const byTag = Array.from(byTagMap.entries())
    .map(([tag, g]) => ({
      tag,
      trades: g.trades,
      winRate: g.trades === 0 ? 0 : g.wins / g.trades,
      totalR: g.totalR,
      expectancy: g.trades === 0 ? 0 : g.totalR / g.trades,
    }))
    .sort((a, b) => b.totalR - a.totalR);

  return {
    count: entries.length,
    wins,
    losses,
    breakevens,
    open,
    winRate,
    avgR,
    totalR,
    maxDrawdown,
    longestWinStreak,
    longestLossStreak,
    profitFactor,
    avgHoldMs,
    perDayOfWeek: perDow,
    // Phase 2 — rich analytics suite.
    avgWinR,
    avgLossR,
    maxWinStreak: longestWinStreak,
    maxLossStreak: longestLossStreak,
    currentStreak: currentStreakOut,
    recoveryFactor,
    rDistribution: rDistributionBuckets.map((b) => ({ bucket: b.bucket, count: b.count })),
    bySymbol,
    bySession,
    byHour,
    byDayOfWeek,
    byTag,
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
    screenshotUrl: row.screenshotUrl ?? null,
    userId: row.userId,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });
}
