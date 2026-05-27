// News adapter — public surface for "fetch latest articles".
//
// Phase 4: Finnhub is the PRIMARY news source (60 req/min free, dedicated
// forex category, high volume). Marketaux is the FALLBACK (100 req/day free,
// but has entity tagging + sentiment scores).
//
// The failover pattern: try Finnhub first → on error, try Marketaux.

import { createHash } from 'node:crypto';

import {
  NewsArticleSchema,
  SymbolSchema,
  type NewsArticle,
  type NewsSentiment,
  type Symbol,
  type SymbolOrCurrencyTag,
} from '@hamafx/shared';

import { ProviderError } from '../errors';
import { runWithFailover, type ProviderAttempt } from '../failover';
import * as finnhub from '../providers/finnhub';
import * as marketaux from '../providers/marketaux';

export interface FetchNewsOptions {
  /** Limit per provider call. Default 50. */
  limit?: number;
  /** Server-side filter — pulls only articles published after this ISO ts. */
  publishedAfter?: string;
  /** Restrict to articles tagged with this symbol after extraction. */
  symbol?: Symbol;
  signal?: AbortSignal;
  apiKeys?: Partial<{ finnhub: string; marketaux: string }>;
}

function resolveKeys(opts: FetchNewsOptions) {
  return {
    finnhub: opts.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '',
    marketaux: opts.apiKeys?.marketaux ?? process.env.MARKETAUX_API_KEY ?? '',
  };
}

/** Stable id derived from URL. We dedupe across providers using this. */
export function articleIdFromUrl(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}

/**
 * Pull the latest news batch. Returns normalised `NewsArticle[]` ready to
 * upsert into `news_articles`. Caller handles the embedding step separately.
 *
 * Provider priority: Finnhub (primary) → Marketaux (fallback).
 */
export async function fetchNews(opts: FetchNewsOptions = {}): Promise<NewsArticle[]> {
  const keys = resolveKeys(opts);
  if (opts.symbol !== undefined) SymbolSchema.parse(opts.symbol);

  const attempts: ProviderAttempt<NewsArticle[]>[] = [];

  // PRIMARY: Finnhub — 60 req/min, dedicated forex category, high volume
  if (keys.finnhub) {
    attempts.push({
      name: 'finnhub',
      run: async () => {
        const raw = await finnhub.fetchNews({
          apiKey: keys.finnhub,
          category: 'forex',
          ...(opts.signal ? { signal: opts.signal } : {}),
        });

        // Filter by publishedAfter if specified
        let filtered = raw;
        if (opts.publishedAfter) {
          const cutoff = Date.parse(opts.publishedAfter);
          if (!Number.isNaN(cutoff)) {
            filtered = raw.filter((a) => a.datetime * 1000 >= cutoff);
          }
        }

        // Apply limit
        const limited = opts.limit ? filtered.slice(0, opts.limit) : filtered;

        return limited.map((a) => {
          const symbols = extractSymbolsFromText(a.headline, a.summary, a.related);
          return NewsArticleSchema.parse({
            id: articleIdFromUrl(a.url),
            title: a.headline,
            summary: a.summary || null,
            url: a.url,
            source: 'finnhub',
            publisher: a.source || null,
            publishedAt: a.datetime * 1000,
            symbols,
            sentiment: null, // Finnhub doesn't provide sentiment
            sentimentScore: null,
            topics: [],
          });
        });
      },
    });
  }

  // FALLBACK: Marketaux — 100 req/day, but has entity tagging + sentiment
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
      'no news provider configured (set FINNHUB_API_KEY or MARKETAUX_API_KEY)',
    );
  }

  const { value } = await runWithFailover(attempts);

  // Optional symbol filter applied AFTER mapping so we still benefit from
  // dedupe across symbols within a single fetch.
  if (opts.symbol) {
    return value.filter(
      (a) => a.symbols.includes(opts.symbol as Symbol) || a.symbols.includes('XAU'),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Finnhub text-based symbol extraction
// ---------------------------------------------------------------------------

/** Keywords that map to our supported symbols/currencies. */
const SYMBOL_KEYWORDS: Array<[RegExp, SymbolOrCurrencyTag]> = [
  [/\b(XAU|gold|XAUUSD)\b/i, 'XAUUSD'],
  [/\b(EUR\/USD|EURUSD|euro)\b/i, 'EURUSD'],
  [/\b(GBP\/USD|GBPUSD|sterling|pound)\b/i, 'GBPUSD'],
  [/\b(USD|dollar|greenback|DXY)\b/i, 'USD'],
  [/\b(EUR|euro)\b/i, 'EUR'],
  [/\b(GBP|pound|sterling)\b/i, 'GBP'],
  [/\b(Fed|FOMC|NFP|CPI|PCE)\b/i, 'USD'],
  [/\b(ECB)\b/i, 'EUR'],
  [/\b(BoE|BOE)\b/i, 'GBP'],
];

function extractSymbolsFromText(
  headline: string,
  summary: string,
  related?: string,
): SymbolOrCurrencyTag[] {
  const text = `${headline} ${summary} ${related ?? ''}`;
  const found = new Set<SymbolOrCurrencyTag>();
  for (const [pattern, tag] of SYMBOL_KEYWORDS) {
    if (pattern.test(text)) found.add(tag);
  }
  return [...found];
}
