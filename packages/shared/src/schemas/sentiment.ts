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

// F3 — Social Sentiment Integration
//
// Zod schemas for social sentiment data from retail positioning,
// news sentiment, and social media sources. Shared contract between
// the AI package sentiment service, multi-agent Sentiment Agent, and API routes.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F3 for the full design.

import { z } from 'zod';

import { SymbolSchema } from '../symbols';

// ---------------------------------------------------------------------------
// Sentiment enums
// ---------------------------------------------------------------------------

export const SentimentLabelSchema = z.enum([
  'very_bullish',
  'bullish',
  'neutral',
  'bearish',
  'very_bearish',
]);
export type SentimentLabel = z.infer<typeof SentimentLabelSchema>;

export const SentimentSourceSchema = z.enum([
  'reddit',
  'twitter',
  'retail_positioning',
  'news',
  'aggregated',
]);
export type SentimentSource = z.infer<typeof SentimentSourceSchema>;

// ---------------------------------------------------------------------------
// Social Sentiment
// ---------------------------------------------------------------------------

export const SocialSentimentSchema = z.object({
  symbol: SymbolSchema,
  source: SentimentSourceSchema,
  sentiment: SentimentLabelSchema,
  /** -1.0 (extreme bearish) to 1.0 (extreme bullish). */
  score: z.number().min(-1).max(1),
  /** Percentage of retail traders long (contrarian indicator). */
  retailLongPct: z.number().min(0).max(100).nullable(),
  /** Number of data points sampled. */
  sampleSize: z.number().int(),
  /** Epoch ms when the data was fetched. */
  fetchedAt: z.number().int(),
  /** Whether the sentiment source is available (API key configured). */
  available: z.boolean(),
});
export type SocialSentiment = z.infer<typeof SocialSentimentSchema>;

// ---------------------------------------------------------------------------
// Aggregated Sentiment — combined view from multiple sources
// ---------------------------------------------------------------------------

export const AggregatedSentimentSchema = z.object({
  symbol: SymbolSchema,
  overall: SentimentLabelSchema,
  overallScore: z.number().min(-1).max(1),
  sources: z.array(SocialSentimentSchema),
  contrarianSignal: z.boolean(),
  contrarianNote: z.string().nullable(),
  fetchedAt: z.number().int(),
});
export type AggregatedSentiment = z.infer<typeof AggregatedSentimentSchema>;

// ---------------------------------------------------------------------------
// Sentiment score → label helper
// ---------------------------------------------------------------------------

export function scoreToLabel(score: number): SentimentLabel {
  if (score >= 0.5) return 'very_bullish';
  if (score >= 0.15) return 'bullish';
  if (score <= -0.5) return 'very_bearish';
  if (score <= -0.15) return 'bearish';
  return 'neutral';
}

/**
 * Detect contrarian signals from retail positioning.
 * When >75% of retail traders are long, it's a contrarian bearish signal.
 * When <25% are long, it's a contrarian bullish signal.
 */
export function detectContrarianSignal(
  retailLongPct: number | null,
): { signal: boolean; note: string | null } {
  if (retailLongPct === null) return { signal: false, note: null };
  if (retailLongPct >= 75) {
    return {
      signal: true,
      note: `Extreme retail long positioning (${retailLongPct.toFixed(0)}% long) — contrarian bearish signal.`,
    };
  }
  if (retailLongPct <= 25) {
    return {
      signal: true,
      note: `Extreme retail short positioning (${(100 - retailLongPct).toFixed(0)}% short) — contrarian bullish signal.`,
    };
  }
  return { signal: false, note: null };
}