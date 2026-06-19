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

// RAG layer for the news embeddings index. Phase 7b upgrade:
//
//   - Dense cosine over `news_embeddings` (existing).
//   - Lexical Postgres FTS over `news_articles.title || summary` (new).
//   - Reciprocal-rank fusion combines the two — robust to either signal
//     being weak on its own ("FOMC minutes" needs lexical, "macro
//     volatility tonight" needs dense).
//   - Time-decay multiplier: similarity *= exp(-ageDays / halflifeDays).
//   - Optional memory expansion: when `kinds` includes journal /
//     briefing / thread_synopsis, results from `memory_embeddings` are
//     RRF-fused into the same ranked list.
//
// `search_knowledge` callers pass the existing news-only signature; the
// hybrid path is opt-in via the new `memoryKinds` argument so existing
// behaviour stays bit-stable when the agent doesn't ask for memory.

import { getDb, schema } from '@hamafx/db';
import type { NewsSentiment, SearchKnowledgeItem, Symbol } from '@hamafx/shared';
import { sql } from 'drizzle-orm';

import { embedTexts, vectorLiteral } from './embeddings';
import { searchMemory, type MemoryKind, type MemoryRow } from './memory/memory-index';

interface RagRow {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publisher: string | null;
  publishedAt: Date;
  sentiment: string | null;
  sentimentScore: number | null;
  similarity: number;
  /** Available only on FTS rows (Postgres ts_rank_cd). */
  ftsRank?: number;
}

const DEFAULT_HALFLIFE_DAYS_NEWS = 7;
const DEFAULT_HALFLIFE_DAYS_MEMORY = 30;

const RRF_K = 60; // Reciprocal-rank fusion constant — larger = flatter weighting.

export interface RunRagQueryArgs {
  embedding: number[];
  limit: number;
  /** Lexical query for FTS. Falls back to a simple to_tsquery if omitted. */
  query?: string;
  since?: number | undefined;
  symbol?: Symbol | undefined;
  /** Halflife in days for time-decay. */
  halflifeDays?: number;
}

/**
 * Hybrid news retrieval (dense + FTS) with time-decay. Returns at most
 * `limit` rows, RRF-fused.
 */
export async function runRagQuery(args: RunRagQueryArgs): Promise<RagRow[]> {
  const halflife = args.halflifeDays ?? DEFAULT_HALFLIFE_DAYS_NEWS;
  const POOL = Math.max(args.limit * 4, 16);

  const [dense, lexical] = await Promise.all([
    runDenseNewsQuery({ ...args, limit: POOL }),
    args.query !== undefined && args.query.trim().length > 0
      ? runFtsNewsQuery({ ...args, query: args.query, limit: POOL })
      : Promise.resolve<RagRow[]>([]),
  ]);

  const fused = rrfFuse([dense, lexical]);
  const decayed = fused.map((r) => decayRow(r, halflife));
  decayed.sort((a, b) => b.similarity - a.similarity);
  return decayed.slice(0, args.limit);
}

// ---------------------------------------------------------------------------
// Dense + FTS query primitives
// ---------------------------------------------------------------------------

interface SubQueryArgs {
  embedding: number[];
  limit: number;
  since?: number | undefined;
  symbol?: Symbol | undefined;
}

async function runDenseNewsQuery(args: SubQueryArgs): Promise<RagRow[]> {
  const { embedding, limit, since, symbol } = args;
  const vec = vectorLiteral(embedding);
  const sinceClause =
    since !== undefined ? sql`AND na.published_at >= ${new Date(since)}` : sql``;
  const symbolClause =
    symbol !== undefined ? sql`AND na.symbols && ARRAY[${symbol}]::text[]` : sql``;

  const result = await getDb().execute(sql<RagRow>`
    SELECT
      na.id,
      na.title,
      na.summary,
      na.url,
      na.source,
      na.publisher,
      na.published_at AS "publishedAt",
      na.sentiment,
      na.sentiment_score AS "sentimentScore",
      1 - (ne.embedding <=> ${vec}::vector) AS similarity
    FROM news_embeddings ne
    JOIN news_articles na ON na.id = ne.article_id
    WHERE 1 = 1
      ${sinceClause}
      ${symbolClause}
    ORDER BY ne.embedding <=> ${vec}::vector
    LIMIT ${limit}
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).rows ?? (result as unknown as RagRow[]);
  return (rows as RagRow[]).map((r) => ({
    ...r,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt : new Date(r.publishedAt),
    similarity: Number(r.similarity),
  }));
}

interface FtsSubQueryArgs extends SubQueryArgs {
  query: string;
}

async function runFtsNewsQuery(args: FtsSubQueryArgs): Promise<RagRow[]> {
  const { query, limit, since, symbol } = args;
  // websearch_to_tsquery is the right primitive: tolerates raw user
  // strings ("FOMC minutes hawkish") without requiring `&` joining.
  const tsq = sql`websearch_to_tsquery('english', ${query})`;
  const sinceClause =
    since !== undefined ? sql`AND na.published_at >= ${new Date(since)}` : sql``;
  const symbolClause =
    symbol !== undefined ? sql`AND na.symbols && ARRAY[${symbol}]::text[]` : sql``;

  const result = await getDb().execute(sql<RagRow>`
    SELECT
      na.id,
      na.title,
      na.summary,
      na.url,
      na.source,
      na.publisher,
      na.published_at AS "publishedAt",
      na.sentiment,
      na.sentiment_score AS "sentimentScore",
      ts_rank_cd(
        to_tsvector('english', coalesce(na.title, '') || ' ' || coalesce(na.summary, '')),
        ${tsq}
      ) AS "ftsRank"
    FROM news_articles na
    WHERE to_tsvector('english', coalesce(na.title, '') || ' ' || coalesce(na.summary, ''))
      @@ ${tsq}
      ${sinceClause}
      ${symbolClause}
    ORDER BY "ftsRank" DESC
    LIMIT ${limit}
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).rows ?? (result as unknown as RagRow[]);
  return (rows as RagRow[]).map((r) => ({
    ...r,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt : new Date(r.publishedAt),
    // FTS rank → pseudo-similarity for downstream uniformity. We never
    // expose `ftsRank`-derived similarity raw to the user; it gets fused
    // into a final similarity value via RRF + decay below.
    similarity: 0,
    ftsRank: Number(r.ftsRank),
  }));
}

// ---------------------------------------------------------------------------
// RRF + time decay
// ---------------------------------------------------------------------------

function rrfFuse(rankings: RagRow[][]): RagRow[] {
  const fused = new Map<string, { row: RagRow; score: number; bestSimilarity: number }>();
  for (const list of rankings) {
    list.forEach((row, idx) => {
      const rank = idx + 1;
      const contribution = 1 / (RRF_K + rank);
      const existing = fused.get(row.id);
      if (existing) {
        existing.score += contribution;
        // Preserve the highest dense similarity we've seen so the final
        // row carries a meaningful similarity number for the consumer.
        if (row.similarity > existing.bestSimilarity) {
          existing.bestSimilarity = row.similarity;
          existing.row = row;
        }
      } else {
        fused.set(row.id, { row, score: contribution, bestSimilarity: row.similarity });
      }
    });
  }

  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ row, bestSimilarity }) => ({
      ...row,
      similarity: bestSimilarity > 0 ? bestSimilarity : 0.5,
    }));
}

function decayRow(row: RagRow, halflifeDays: number): RagRow {
  const ageDays = Math.max(
    0,
    (Date.now() - row.publishedAt.getTime()) / (24 * 60 * 60 * 1000),
  );
  // exp(-ln2 * age / halflife) — a true halflife model.
  const factor = Math.exp(-Math.LN2 * (ageDays / halflifeDays));
  return { ...row, similarity: row.similarity * factor };
}

// ---------------------------------------------------------------------------
// Memory-side hybrid search (journal / briefing / thread_synopsis)
// ---------------------------------------------------------------------------

export interface RunMemoryQueryArgs {
  embedding: number[];
  limit: number;
  kinds: MemoryKind[];
  since?: number | undefined;
  symbol?: Symbol | undefined;
  halflifeDays?: number;
  userId: string;
}

export async function runMemoryQuery(args: RunMemoryQueryArgs): Promise<MemoryRow[]> {
  const halflife = args.halflifeDays ?? DEFAULT_HALFLIFE_DAYS_MEMORY;
  const memArgs: Parameters<typeof searchMemory>[0] = {
    embedding: args.embedding,
    limit: args.limit,
    kinds: args.kinds,
    userId: args.userId,
  };
  if (args.symbol !== undefined) memArgs.symbol = args.symbol;
  if (args.since !== undefined) memArgs.since = args.since;
  const rows = await searchMemory(memArgs);
  return rows.map((r) => {
    const ageDays = Math.max(0, (Date.now() - r.occurredAtMs) / (24 * 60 * 60 * 1000));
    const factor = Math.exp(-Math.LN2 * (ageDays / halflife));
    return { ...r, similarity: r.similarity * factor };
  });
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** Cheap probe: does `news_embeddings` have any rows at all? */
export async function countEmbeddings(): Promise<number> {
  const rows = await getDb()
    .select({ id: schema.newsEmbeddings.articleId })
    .from(schema.newsEmbeddings)
    .limit(1);
  return rows.length;
}

/** Map a RAG row to the `SearchKnowledgeItem` DTO the tool returns. */
export function ragRowToItem(r: RagRow): SearchKnowledgeItem {
  const sentiment: NewsSentiment | null =
    r.sentiment === 'positive' || r.sentiment === 'negative' || r.sentiment === 'neutral'
      ? r.sentiment
      : null;
  const sim = Math.max(0, Math.min(1, r.similarity));
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    url: r.url,
    source: r.source,
    publisher: r.publisher,
    publishedAt: r.publishedAt.getTime(),
    sentiment,
    sentimentScore: r.sentimentScore,
    similarity: sim,
  };
}

/**
 * Map a memory row to the `SearchKnowledgeItem` shape so the chat part
 * can render journal / briefing memories alongside news without a second
 * UI primitive. We synthesise a "title" from kind + symbol and use the
 * `text` body as the summary.
 */
export function memoryRowToItem(r: MemoryRow): SearchKnowledgeItem {
  const titleHead =
    r.kind === 'journal'
      ? `Journal · ${r.symbol ?? ''}`
      : r.kind === 'briefing'
        ? 'Briefing'
        : 'Thread synopsis';
  const sim = Math.max(0, Math.min(1, r.similarity));
  return {
    id: `mem:${r.id}`,
    title: titleHead.trim(),
    summary: r.text,
    // No outbound URL for memory rows — surface the journal/chat deep
    // link in the part renderer if needed.
    url: '',
    source: r.kind,
    publisher: null,
    publishedAt: r.occurredAtMs,
    sentiment: null,
    sentimentScore: null,
    similarity: sim,
  };
}

/**
 * Embed a query string with the same model id stored alongside the corpus
 * (defaults to `AI_EMBEDDING_MODEL` when env is supplied).
 */
export async function embedQuery(
  query: string,
  env?: { AI_EMBEDDING_MODEL?: string },
): Promise<{ embedding: number[]; model: string }> {
  const args: Parameters<typeof embedTexts>[0] = { texts: [query] };
  if (env && env.AI_EMBEDDING_MODEL) args.env = { AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL };
  const r = await embedTexts(args);
  const e = r.embeddings[0];
  if (!e) throw new Error('embedQuery: provider returned no embedding');
  return { embedding: e, model: r.model };
}
