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

// Output envelope returned by the `search_knowledge` AI tool. Mirrors
// `ToolNewsItem` plus a `similarity` score in [0, 1] (1 = identical) derived
// from pgvector cosine distance.
//
// Source of truth: packages/ai/src/tools/search-knowledge.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { ToolNewsItemSchema } from './get-news';

export const SearchKnowledgeInputSchema = z.object({
  query: z.string().min(2).max(500),
  /** ms epoch lower bound on `publishedAt`. Omit for unbounded. */
  since: z.number().int().optional(),
  /** Filter to articles tagged with this symbol. */
  symbol: SymbolSchema.optional(),
  limit: z.number().int().min(1).max(10).default(5),
});
export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeInputSchema>;

export const SearchKnowledgeItemSchema = ToolNewsItemSchema.extend({
  /** Cosine similarity in [0, 1]; 1 = identical, 0 = orthogonal. */
  similarity: z.number().min(0).max(1),
});
export type SearchKnowledgeItem = z.infer<typeof SearchKnowledgeItemSchema>;

export const SearchKnowledgeOutputSchema = z.object({
  items: z.array(SearchKnowledgeItemSchema),
  /** Embedding-model id used for the query embedding. */
  model: z.string(),
  /** True when `news_embeddings` is empty (cron hasn't run yet). */
  pipelinePending: z.boolean(),
});
export type SearchKnowledgeOutput = z.infer<typeof SearchKnowledgeOutputSchema>;
