import { z } from 'zod';
import { CurrencyTagSchema, SymbolSchema } from '../symbols.js';

/** Articles can be tagged with either an instrument symbol or a raw currency. */
export const SymbolOrCurrencyTagSchema = z.union([SymbolSchema, CurrencyTagSchema]);
export type SymbolOrCurrencyTag = z.infer<typeof SymbolOrCurrencyTagSchema>;

export const NewsSentimentSchema = z.enum(['positive', 'negative', 'neutral']);
export type NewsSentiment = z.infer<typeof NewsSentimentSchema>;

export const NewsArticleSchema = z.object({
  /** Stable across sources — derived from sha1(url). */
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  url: z.string().url(),
  /** Provider that delivered the article. */
  source: z.string(),
  publisher: z.string().nullable(),
  /** Publication time, ms epoch UTC. */
  publishedAt: z.number().int(),
  symbols: z.array(SymbolOrCurrencyTagSchema),
  sentiment: NewsSentimentSchema.nullable(),
  /** -1..1; nullable when provider doesn't supply one. */
  sentimentScore: z.number().min(-1).max(1).nullable(),
  topics: z.array(z.string()).default([]),
});

export type NewsArticle = z.infer<typeof NewsArticleSchema>;
