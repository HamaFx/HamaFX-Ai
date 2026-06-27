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

// F3 — Tool output schema for get_social_sentiment.

import { z } from 'zod';

export const GetSocialSentimentOutputSchema = z.object({
  symbol: z.string(),
  overall: z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']),
  overallScore: z.number().min(-1).max(1),
  contrarianSignal: z.boolean(),
  contrarianNote: z.string().nullable(),
  sources: z.array(
    z.object({
      source: z.enum(['reddit', 'twitter', 'retail_positioning', 'news', 'aggregated']),
      sentiment: z.enum(['very_bullish', 'bullish', 'neutral', 'bearish', 'very_bearish']),
      score: z.number().min(-1).max(1),
      retailLongPct: z.number().nullable(),
      sampleSize: z.number().int(),
      available: z.boolean(),
    }),
  ),
  fetchedAt: z.number().int(),
  available: z.boolean(),
});

export type GetSocialSentimentOutput = z.infer<typeof GetSocialSentimentOutputSchema>;