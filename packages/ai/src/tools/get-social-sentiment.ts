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

// Tool: get_social_sentiment
//
// F3 — Fetches social/retail sentiment for a forex or gold symbol.
// When no sentiment API key is configured, returns `available: false`
// so the AI can note that sentiment data is not available.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F3 for the design.

import { z } from 'zod';
import { tool } from 'ai';

import { getSentimentService } from '../sentiment';
import { getToolContext } from '../tool-context';
import { SymbolSchema } from '@hamafx/shared';

const InputSchema = z.object({
  symbol: SymbolSchema.describe('The forex or gold symbol to get sentiment for'),
});

const _OutputSchema = z.object({
  symbol: z.string(),
  overall: z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']),
  overallScore: z.number(),
  contrarianSignal: z.boolean(),
  contrarianNote: z.string().nullable(),
  sources: z.array(
    z.object({
      source: z.enum(['reddit', 'twitter', 'retail_positioning', 'news', 'aggregated']),
      sentiment: z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']),
      score: z.number(),
      retailLongPct: z.number().nullable(),
      sampleSize: z.number(),
      available: z.boolean(),
    }),
  ),
  fetchedAt: z.number(),
  available: z.boolean(),
});

export type GetSocialSentimentOutput = z.infer<typeof _OutputSchema>;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_social_sentiment: { input: z.infer<typeof InputSchema> };
  }
}

export const getSocialSentimentTool = tool({
  description:
    'Fetch social media and retail positioning sentiment for a forex or gold symbol. Returns an aggregated sentiment score, contrarian signals from retail positioning, and per-source breakdown. When no sentiment API key is configured, returns available=false.',
  inputSchema: InputSchema,
  execute: async ({ symbol }): Promise<GetSocialSentimentOutput> => {
    // Access userId to ensure the tool is running in a user context
    getToolContext();

    const service = getSentimentService();
    const sentiment = await service.getAggregatedSentiment(symbol);

    const anyAvailable = sentiment.sources.some((s) => s.available);

    return {
      symbol: sentiment.symbol,
      overall: sentiment.overall,
      overallScore: sentiment.overallScore,
      contrarianSignal: sentiment.contrarianSignal,
      contrarianNote: sentiment.contrarianNote,
      sources: sentiment.sources.map((s) => ({
        source: s.source,
        sentiment: s.sentiment,
        score: s.score,
        retailLongPct: s.retailLongPct,
        sampleSize: s.sampleSize,
        available: s.available,
      })),
      fetchedAt: sentiment.fetchedAt,
      available: anyAvailable,
    };
  },
});