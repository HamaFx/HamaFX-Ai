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

// Tool: get_journal_stats.
//
// Reuses `computeStats` for the global block and adds per-symbol +
// per-tag breakdowns via SQL group-bys. Empty filter sets return an
// all-zero stats block + empty breakdown arrays — never throws.

import { getDb, schema } from '@hamafx/db';
import {
  GetJournalStatsInputSchema,
  type GetJournalStatsOutput,
  type StatBreakdown,
} from '@hamafx/shared';
import { tool } from 'ai';
import { and, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';

import { computeStats } from '../journal/persistence';
import { getToolContext } from '../tool-context';

const InputSchema = GetJournalStatsInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_journal_stats: { input: z.infer<typeof InputSchema> };
  }
}

export const getJournalStatsTool = tool({
  description:
    "Compute journal stats — count, win rate, average R-multiple, total R — globally and broken down by symbol and by tag. Optional filters: time window (`sinceMs`/`untilMs`, ms epoch), `symbol`, `side`. Use for any 'how am I doing on X' or 'win rate this month' prompt. Returns top breakdowns sorted by trade count.",
  inputSchema: InputSchema,
  execute: async ({ sinceMs, untilMs, symbol, side }): Promise<GetJournalStatsOutput> => {
    const userId = getToolContext().userId;

    const stats = await computeStats(userId, {
      ...(sinceMs !== undefined ? { sinceMs } : {}),
      ...(untilMs !== undefined ? { untilMs } : {}),
    });

    const filters: SQL[] = [eq(schema.journalEntries.userId, userId)];
    if (sinceMs !== undefined) filters.push(gte(schema.journalEntries.openedAt, new Date(sinceMs)));
    if (untilMs !== undefined) filters.push(lte(schema.journalEntries.openedAt, new Date(untilMs)));
    if (symbol !== undefined) filters.push(eq(schema.journalEntries.symbol, symbol));
    if (side !== undefined) filters.push(eq(schema.journalEntries.side, side));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [bySymbol, byTag] = await Promise.all([
      breakdownBySymbol(where),
      breakdownByTag(where),
    ]);

    return { stats, bySymbol, byTag };
  },
});

// ---------------------------------------------------------------------------
// SQL group-bys
// ---------------------------------------------------------------------------

interface RawBreakdownRow {
  key: string | null;
  count: number | string;
  wins: number | string | null;
  closed: number | string | null;
  avg_r: number | null;
}

async function breakdownBySymbol(where: SQL | undefined): Promise<StatBreakdown[]> {
  const rows = await getDb()
    .select({
      key: schema.journalEntries.symbol,
      count: sql<number>`count(*)`.as('count'),
      wins: sql<number>`sum(case when ${schema.journalEntries.outcome} = 'win' then 1 else 0 end)`.as('wins'),
      closed: sql<number>`sum(case when ${schema.journalEntries.outcome} <> 'open' then 1 else 0 end)`.as('closed'),
      avg_r: sql<number | null>`avg(${schema.journalEntries.rMultiple}) filter (where ${schema.journalEntries.rMultiple} is not null)`.as('avg_r'),
    })
    .from(schema.journalEntries)
    .where(where)
    .groupBy(schema.journalEntries.symbol)
    .orderBy(sql`count(*) desc`);

  return rows.map(toBreakdown);
}

async function breakdownByTag(where: SQL | undefined): Promise<StatBreakdown[]> {
  // unnest(tags) explodes one row per tag so the GROUP BY can bucket them.
  const rows = await getDb()
    .select({
      key: sql<string>`unnest(${schema.journalEntries.tags})`.as('key'),
      count: sql<number>`count(*)`.as('count'),
      wins: sql<number>`sum(case when ${schema.journalEntries.outcome} = 'win' then 1 else 0 end)`.as('wins'),
      closed: sql<number>`sum(case when ${schema.journalEntries.outcome} <> 'open' then 1 else 0 end)`.as('closed'),
      avg_r: sql<number | null>`avg(${schema.journalEntries.rMultiple}) filter (where ${schema.journalEntries.rMultiple} is not null)`.as('avg_r'),
    })
    .from(schema.journalEntries)
    .where(where)
    .groupBy(sql`unnest(${schema.journalEntries.tags})`)
    .orderBy(sql`count(*) desc`);

  return rows.map(toBreakdown);
}

function toBreakdown(r: RawBreakdownRow): StatBreakdown {
  const count = Number(r.count ?? 0);
  const wins = Number(r.wins ?? 0);
  const closed = Number(r.closed ?? 0);
  const winRate = closed === 0 ? 0 : wins / closed;
  const avgR = Number(r.avg_r ?? 0);
  return {
    key: r.key ?? '(untagged)',
    count,
    winRate,
    avgR: Number.isFinite(avgR) ? avgR : 0,
  };
}
