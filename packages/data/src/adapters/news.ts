// News adapter — public surface for "fetch latest articles".
//
// Phase 1c: Marketaux only. Finnhub falls in as a fallback later (its v1
// news shape will reuse the same NewsArticle DTO via a separate mapper).

import { createHash } from 'node:crypto';

import {
  type NewsArticle,
  NewsArticleSchema,
  SymbolSchema,
  type Symbol,
} from '@hamafx/shared';

import { ProviderError } from '../errors';
import { runWithFailover, type ProviderAttempt } from '../failover';
import * as marketaux from '../providers/marketaux';

export interface FetchNewsOptions {
  /** Limit per provider call. Default 50. */
  limit?: number;
  /** Server-side filter — pulls only articles published after this ISO ts. */
  publishedAfter?: string;
  /** Restrict to articles tagged with this symbol after extraction. */
  symbol?: Symbol;
  signal?: AbortSignal;
  apiKeys?: Partial<{ marketaux: string }>;
}

function resolveKeys(opts: FetchNewsOptions) {
  return {
    marketaux: opts.apiKeys?.marketaux ?? process.env.MARKETAUX_API_KEY ?? '',
  };
}

/** Stable id derived from URL. We dedupe across providers using this. */
export function articleIdFromUrl(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}

/**
 * Pull the latest news batch. Returns normalised `NewsArticle[]` ready to
 * upsert into `news_articles`. Caller handles the embedding step separately
 * — we deliberately don't entangle the two (one upstream failure shouldn't
 * stall the other).
 */
export async function fetchNews(opts: FetchNewsOptions = {}): Promise<NewsArticle[]> {
  const keys = resolveKeys(opts);
  if (opts.symbol !== undefined) SymbolSchema.parse(opts.symbol);

  const attempts: ProviderAttempt<NewsArticle[]>[] = [];

  if (keys.marketaux) {
    attempts.push({
      name: 'marketaux',
      run: async () => {
        const raw = await marketaux.fetchLatest({
          apiKey: keys.marketaux,
          ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
          ...(opts.publishedAfter ? { publishedAfter: opts.publishedAfter } : {}),
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
        return raw.map((a) => {
          const symbols = marketaux.extractSymbols({
            entities: a.entities,
            title: a.title,
            snippet: a.snippet ?? null,
          });
          const sentiment = marketaux.aggregateSentiment(a.entities);
          return NewsArticleSchema.parse({
            id: articleIdFromUrl(a.url),
            title: a.title,
            summary: a.description ?? a.snippet ?? null,
            url: a.url,
            source: 'marketaux',
            publisher: a.source ?? null,
            publishedAt: Date.parse(a.published_at),
            symbols,
            sentiment: sentiment?.label ?? null,
            sentimentScore: sentiment?.score ?? null,
            topics: [],
          });
        });
      },
    });
  }

  if (attempts.length === 0) {
    throw new ProviderError(
      'NO_PROVIDER_AVAILABLE',
      'none',
      'no news provider configured (set MARKETAUX_API_KEY)',
    );
  }

  const { value } = await runWithFailover(attempts);

  // Optional symbol filter applied AFTER mapping so we still benefit from
  // dedupe across symbols within a single fetch.
  if (opts.symbol) {
    return value.filter((a) =>
      a.symbols.includes(opts.symbol as Symbol) || a.symbols.includes('XAU'),
    );
  }
  return value;
}
