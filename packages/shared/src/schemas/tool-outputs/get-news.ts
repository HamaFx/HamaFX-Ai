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

// Output envelope returned by the `get_news` AI tool. The tool's `NewsItem`
// is a slimmer DTO than `NewsArticleSchema` (no `symbols[]` / `topics[]`),
// so we define the per-row schema here and reuse the shared
// `NewsSentimentSchema`.
//
// Source of truth: packages/ai/src/tools/get-news.ts execute() return type.

import { z } from 'zod';

import { NewsSentimentSchema } from '../news';

export const ToolNewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  url: z.string(),
  source: z.string(),
  publisher: z.string().nullable(),
  /** Publication time, ms epoch UTC. */
  publishedAt: z.number().int(),
  sentiment: NewsSentimentSchema.nullable(),
  /** -1..1; nullable when provider doesn't supply one. */
  sentimentScore: z.number().nullable(),
});
export type ToolNewsItem = z.infer<typeof ToolNewsItemSchema>;

export const GetNewsOutputSchema = z.object({
  items: z.array(ToolNewsItemSchema),
  /** True if the news pipeline hasn't populated the DB yet. */
  pipelinePending: z.boolean(),
});

export type GetNewsOutput = z.infer<typeof GetNewsOutputSchema>;
