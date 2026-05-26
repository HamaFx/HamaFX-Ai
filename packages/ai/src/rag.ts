// RAG layer for the news embeddings index. Single-purpose helpers that the
// `search_knowledge` tool consumes — kept here (and out of `embeddings.ts`)
// so the embed-call path stays a thin wrapper around the AI SDK while RAG
// gets to own its SQL.
//
// Cosine similarity is computed via pgvector's `<=>` operator (`distance`),
// which we map back to similarity via `1 - distance`. The HNSW index on
// `news_embeddings.embedding` makes the ORDER BY linear in the result limit,
// not the table size.

import { getDb, schema } from '@hamafx/db';
import type { NewsSentiment, SearchKnowledgeItem, Symbol } from '@hamafx/shared';
import { sql } from 'drizzle-orm';

import { embedTexts } from './embeddings';

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
}

export interface RunRagQueryArgs {
  /** Query embedding vector. Must match the dimension stored in `news_embeddings`. */
  embedding: number[];
  limit: number;
  /** ms epoch lower bound on `publishedAt`. */
  since?: number | undefined;
  /** Filter to articles tagged with this symbol. */
  symbol?: Symbol | undefined;
}

/**
 * Returns at most `limit` rows from `news_embeddings` joined to
 * `news_articles`, ordered by ascending cosine distance (= descending
 * similarity). Empty when the index has no matches under the filters.
 */
export async function runRagQuery(args: RunRagQueryArgs): Promise<RagRow[]> {
  const { embedding, limit, since, symbol } = args;

  // pgvector accepts a string-formatted array literal in SQL.
  const vec = `[${embedding.join(',')}]`;
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

  // drizzle-orm typed-execute returns the raw driver rows; we just need to
  // narrow the shape and date-coerce `publishedAt`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).rows ?? (result as unknown as RagRow[]);
  return (rows as RagRow[]).map((r) => ({
    ...r,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt : new Date(r.publishedAt),
    similarity: Number(r.similarity),
  }));
}

/** Fast-path probe: does `news_embeddings` have any rows at all? */
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
  // Clamp similarity to [0, 1] — pgvector cosine can spit out 1.0000001
  // for near-identical vectors due to float rounding.
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
 * Embed a query string with the same model id stored alongside the corpus
 * (defaults to `AI_EMBEDDING_MODEL` when env is supplied).
 */
export async function embedQuery(
  query: string,
  env?: { AI_EMBEDDING_MODEL?: string },
): Promise<{ embedding: number[]; model: string }> {
  const r = await embedTexts({
    texts: [query],
    ...(env && env.AI_EMBEDDING_MODEL ? { env: { AI_EMBEDDING_MODEL: env.AI_EMBEDDING_MODEL } } : {}),
  });
  const e = r.embeddings[0];
  if (!e) throw new Error('embedQuery: provider returned no embedding');
  return { embedding: e, model: r.model };
}
