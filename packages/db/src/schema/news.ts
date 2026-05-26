import { sql } from 'drizzle-orm';
import { doublePrecision, index, pgTable, text, timestamp, vector } from 'drizzle-orm/pg-core';

/**
 * Cached news articles. `id` is sha1(url) so we dedupe across providers.
 * Body text is NOT mirrored — only title + summary. We display+link out.
 */
export const newsArticles = pgTable(
  'news_articles',
  {
    /** sha1(url) hex */
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    summary: text('summary'),
    url: text('url').notNull().unique(),
    source: text('source').notNull(),
    publisher: text('publisher'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    /** SymbolOrCurrencyTag[] — keep as text[] for filter speed. */
    symbols: text('symbols')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** "positive" | "negative" | "neutral" | null */
    sentiment: text('sentiment'),
    sentimentScore: doublePrecision('sentiment_score'),
    topics: text('topics')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('news_published_at_idx').on(t.publishedAt),
    index('news_source_idx').on(t.source),
    index('news_symbols_gin').using('gin', t.symbols),
  ],
);

/**
 * Embeddings split off so the main row stays small. text-embedding-3-small
 * outputs 1536 dims. Switch dims if we change models — keep one model active.
 */
export const newsEmbeddings = pgTable(
  'news_embeddings',
  {
    articleId: text('article_id')
      .primaryKey()
      .references(() => newsArticles.id, { onDelete: 'cascade' }),
    /** Provider/model id, e.g. "openai/text-embedding-3-small". */
    model: text('model').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  // HNSW index for fast cosine similarity search.
  (t) => [index('news_embeddings_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops'))],
);
