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

// News article and economic event query helpers.

import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

// ── News Articles ─────────────────────────────────────────────────────────

export type NewsArticleRow = typeof schema.newsArticles.$inferSelect;
export type NewsArticleInsert = typeof schema.newsArticles.$inferInsert;

export async function listRecentArticles(
  limit = 50,
  offset = 0,
  filters?: {
    sentiment?: string;
    symbol?: string;
    query?: string;
  },
): Promise<NewsArticleRow[]> {
  const db = getDb();
  const conditions: ReturnType<typeof and>[] = [];

  if (filters?.sentiment && filters.sentiment !== 'all') {
    if (filters.sentiment === 'neutral') {
      conditions.push(
        or(isNull(schema.newsArticles.sentiment), eq(schema.newsArticles.sentiment, 'neutral')),
      );
    } else {
      conditions.push(eq(schema.newsArticles.sentiment, filters.sentiment));
    }
  }

  if (filters?.symbol && filters.symbol !== 'all') {
    conditions.push(sql`${schema.newsArticles.symbols} @> ARRAY[${filters.symbol}]::text[]`);
  }

  if (filters?.query) {
    const q = `%${filters.query}%`;
    conditions.push(
      or(
        ilike(schema.newsArticles.title, q),
        ilike(schema.newsArticles.summary, q),
        ilike(schema.newsArticles.publisher, q),
        ilike(schema.newsArticles.source, q),
      ),
    );
  }

  const query = db.select().from(schema.newsArticles);
  if (conditions.length > 0) query.where(and(...conditions));

  return query
    .orderBy(desc(schema.newsArticles.publishedAt))
    .limit(limit)
    .offset(offset);
}

export async function getLatestArticleTimestamp(): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select({ max: sql<Date | null>`max(${schema.newsArticles.publishedAt})` })
    .from(schema.newsArticles);
  const m = rows[0]?.max ?? null;
  return m ? m.getTime() : null;
}

export async function insertArticle(row: NewsArticleInsert): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.newsArticles)
    .values(row)
    .onConflictDoNothing({ target: schema.newsArticles.id });
}

// ── Economic Events ───────────────────────────────────────────────────────

export type EconomicEventRow = typeof schema.economicEvents.$inferSelect;
export type EconomicEventInsert = typeof schema.economicEvents.$inferInsert;

export async function listUpcomingEvents(
  fromMs: number,
  toMs: number,
  limit = 100,
): Promise<EconomicEventRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        gte(schema.economicEvents.date, new Date(fromMs)),
        lte(schema.economicEvents.date, new Date(toMs)),
      ),
    )
    .orderBy(asc(schema.economicEvents.date))
    .limit(limit);
}

export async function listHighImpactEventsInWindow(
  currencies: string[],
  fromMs: number,
  toMs: number,
): Promise<EconomicEventRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        inArray(schema.economicEvents.currency, currencies),
        gte(schema.economicEvents.date, new Date(fromMs)),
        lte(schema.economicEvents.date, new Date(toMs)),
        inArray(schema.economicEvents.importance, ['high']),
      ),
    )
    .orderBy(asc(schema.economicEvents.date));
}

export async function listHighMediumEventsInWindow(
  currencies: string[],
  fromMs: number,
  toMs: number,
): Promise<EconomicEventRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        inArray(schema.economicEvents.currency, currencies),
        gte(schema.economicEvents.date, new Date(fromMs)),
        lte(schema.economicEvents.date, new Date(toMs)),
        inArray(schema.economicEvents.importance, ['medium', 'high']),
      ),
    )
    .orderBy(schema.economicEvents.date);
}

export async function listFredEventsMissingActual(
  until: Date,
  limit = 200,
): Promise<EconomicEventRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        eq(schema.economicEvents.source, 'fred'),
        isNull(schema.economicEvents.actual),
        lt(schema.economicEvents.date, until),
      ),
    )
    .limit(limit);
}
