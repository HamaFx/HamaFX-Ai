// Tool: get_news.
//
// Reads from the `news_articles` table populated by /api/cron/news (Phase 1c).
// Until that cron runs the table is empty and this tool returns an empty
// array — that's fine, the model handles it gracefully.

import { getDb, schema } from '@hamafx/db';
import { SymbolSchema, type GetNewsOutput, type ToolNewsItem } from '@hamafx/shared';
import { tool } from 'ai';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

const InputSchema = z.object({
  /** Optional symbol filter. Omit to get cross-symbol macro coverage. */
  symbol: SymbolSchema.optional(),
  /** ms epoch lower bound. Defaults to 24 h ago. */
  since: z.number().int().optional(),
  limit: z.number().int().min(1).max(20).default(8),
  /** Minimum sentiment magnitude to include. */
  minSentiment: z.number().min(0).max(1).optional(),
});

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_news: { input: z.infer<typeof InputSchema> };
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const getNewsTool = tool({
  description:
    'List recent financial news articles relevant to a symbol or the macro picture. Filtered by publishedAt and optional sentiment magnitude. Returns an empty list (with pipelinePending=true) if the news cron has not populated the DB yet.',
  inputSchema: InputSchema,
  execute: async ({ symbol, since, limit, minSentiment }): Promise<GetNewsOutput> => {
    const sinceDate = new Date(since ?? Date.now() - ONE_DAY_MS);

    const filters = [gte(schema.newsArticles.publishedAt, sinceDate)];
    if (symbol) {
      filters.push(sql`${schema.newsArticles.symbols} && ARRAY[${symbol}]::text[]`);
    }
    if (minSentiment !== undefined) {
      filters.push(sql`abs(${schema.newsArticles.sentimentScore}) >= ${minSentiment}`);
    }

    const rows = await getDb()
      .select()
      .from(schema.newsArticles)
      .where(and(...filters))
      .orderBy(desc(schema.newsArticles.publishedAt))
      .limit(limit);

    // Detect "pipeline empty" so the UI can surface the right message.
    if (rows.length === 0) {
      const probe = await getDb()
        .select({ id: schema.newsArticles.id })
        .from(schema.newsArticles)
        .limit(1);
      if (probe.length === 0) {
        return { items: [], pipelinePending: true };
      }
    }

    return {
      pipelinePending: false,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        url: r.url,
        source: r.source,
        publisher: r.publisher,
        publishedAt: r.publishedAt.getTime(),
        sentiment: (r.sentiment as ToolNewsItem['sentiment']) ?? null,
        sentimentScore: r.sentimentScore,
      })),
    };
  },
});

// Silence unused-import lint when this file is bundled in isolation.
void eq;
