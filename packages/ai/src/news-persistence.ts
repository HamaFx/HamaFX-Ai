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

// News persistence helpers used by the cron handler. Kept here (not in the
// route file) so the same logic is reusable from a future Fly.io worker
// without duplicating SQL.

import { getDb, schema } from '@hamafx/db';
import {
  type EconomicEvent,
  type EventCurrency,
  type Importance,
  type NewsArticle,
  type NewsSentiment,
  type SymbolOrCurrencyTag,
} from '@hamafx/shared';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { embedTexts } from './embeddings';

/**
 * Upsert a batch of articles into `news_articles`. Returns counts so the
 * cron route can report progress.
 *
 * Conflict policy: ON CONFLICT (id) DO NOTHING. We deliberately don't update
 * existing rows — the first-seen version is the canonical title/summary, and
 * Marketaux occasionally revises titles which would churn embeddings.
 */
export async function upsertArticles(
  articles: NewsArticle[],
): Promise<{ inserted: number; skipped: number }> {
  if (articles.length === 0) return { inserted: 0, skipped: 0 };

  const rows = articles.map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary,
    url: a.url,
    source: a.source,
    publisher: a.publisher,
    publishedAt: new Date(a.publishedAt),
    symbols: a.symbols as string[],
    sentiment: a.sentiment,
    sentimentScore: a.sentimentScore,
    topics: a.topics as string[],
  }));

  const inserted = await getDb()
    .insert(schema.newsArticles)
    .values(rows)
    .onConflictDoNothing({ target: schema.newsArticles.id })
    .returning({ id: schema.newsArticles.id });

  return { inserted: inserted.length, skipped: rows.length - inserted.length };
}

/**
 * Read recent articles for the /news page. Server-only — pages call this
 * from `getServerSideProps`-style server components.
 */
export async function listRecentArticles(limit = 50): Promise<NewsArticle[]> {
  const rows = await getDb()
    .select()
    .from(schema.newsArticles)
    .orderBy(desc(schema.newsArticles.publishedAt))
    .limit(limit);
  return rows.map(rowToNewsArticle);
}

/**
 * High-water mark over `news_articles.published_at`, ms epoch UTC.
 * Returns `null` when the table is empty.
 *
 * Used by the news cron (`/api/cron/news`) to backfill any articles
 * published while the cron was paused. Phase 3 hardening §13.
 */
export async function latestArticleTimestampMs(): Promise<number | null> {
  const rows = await getDb()
    .select({ max: sql<Date | null>`max(${schema.newsArticles.publishedAt})` })
    .from(schema.newsArticles);
  const m = rows[0]?.max ?? null;
  return m ? m.getTime() : null;
}

function rowToNewsArticle(r: typeof schema.newsArticles.$inferSelect): NewsArticle {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    url: r.url,
    source: r.source,
    publisher: r.publisher,
    publishedAt: r.publishedAt.getTime(),
    symbols: (r.symbols ?? []) as SymbolOrCurrencyTag[],
    sentiment: (r.sentiment as NewsSentiment | null) ?? null,
    sentimentScore: r.sentimentScore,
    topics: (r.topics ?? []) as string[],
  };
}

/**
 * Read an upcoming-events window for the /calendar page. Default window
 * spans (-6h, +14d).
 */
export async function listUpcomingEvents(
  opts: { fromMs?: number; toMs?: number; limit?: number } = {},
): Promise<EconomicEvent[]> {
  const fromMs = opts.fromMs ?? Date.now() - 6 * 60 * 60 * 1000;
  const toMs = opts.toMs ?? Date.now() + 14 * 24 * 60 * 60 * 1000;
  const rows = await getDb()
    .select()
    .from(schema.economicEvents)
    .where(
      and(
        gte(schema.economicEvents.date, new Date(fromMs)),
        lte(schema.economicEvents.date, new Date(toMs)),
      ),
    )
    .orderBy(asc(schema.economicEvents.date))
    .limit(opts.limit ?? 100);

  return rows.map(rowToEconomicEvent);
}

function rowToEconomicEvent(r: typeof schema.economicEvents.$inferSelect): EconomicEvent {
  return {
    id: r.id,
    title: r.title,
    country: r.country,
    currency: (r.currency as EventCurrency | null) ?? null,
    importance: r.importance as Importance,
    date: r.date.getTime(),
    actual: r.actual,
    forecast: r.forecast,
    previous: r.previous,
    unit: r.unit,
    source: r.source,
  };
}

interface BackfillRow {
  id: string;
  title: string;
  summary: string | null;
}

/**
 * Find articles that don't have embeddings yet and embed them in `batchSize`
 * chunks. We cap total work per run with `maxRows` so the function stays
 * under Vercel's 60s timeout for cron handlers.
 */
export async function backfillEmbeddings(
  opts: {
    batchSize?: number;
    maxRows?: number;
    signal?: AbortSignal;
  } = {},
): Promise<{ embedded: number; batches: number; totalTokens: number }> {
  const batchSize = opts.batchSize ?? 32;
  const maxRows = opts.maxRows ?? 256;

  const candidates: BackfillRow[] = await getDb()
    .select({
      id: schema.newsArticles.id,
      title: schema.newsArticles.title,
      summary: schema.newsArticles.summary,
    })
    .from(schema.newsArticles)
    .leftJoin(schema.newsEmbeddings, eq(schema.newsArticles.id, schema.newsEmbeddings.articleId))
    .where(isNull(schema.newsEmbeddings.articleId))
    .limit(maxRows);

  let embedded = 0;
  let totalTokens = 0;
  let batches = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    if (opts.signal?.aborted) break;
    const batch = candidates.slice(i, i + batchSize);
    const texts = batch.map((b) => `${b.title}\n${b.summary ?? ''}`.trim());

    const { embeddings, model, inputTokens } = await embedTexts({
      texts,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });

    const rows = batch.map((b, idx) => ({
      articleId: b.id,
      model,
      embedding: embeddings[idx]!,
    }));

    await getDb().insert(schema.newsEmbeddings).values(rows).onConflictDoNothing();

    embedded += rows.length;
    totalTokens += inputTokens;
    batches += 1;
  }

  return { embedded, batches, totalTokens };
}

/** Diagnostic — count rows without embeddings. */
export async function countPendingEmbeddings(): Promise<number> {
  const row = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.newsArticles)
    .leftJoin(schema.newsEmbeddings, eq(schema.newsArticles.id, schema.newsEmbeddings.articleId))
    .where(isNull(schema.newsEmbeddings.articleId));
  return Number(row[0]?.n ?? 0);
}
