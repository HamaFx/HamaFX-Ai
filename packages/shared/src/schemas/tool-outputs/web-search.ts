/**
 * Copyright 2026 Kestrel
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

import { z } from 'zod';

export const WebSearchStatusSchema = z.enum(['success', 'empty', 'unavailable', 'error']);
export type WebSearchStatus = z.infer<typeof WebSearchStatusSchema>;

export const WebSearchProviderSchema = z.enum(['exa', 'tavily', 'brave']);
export type WebSearchProvider = z.infer<typeof WebSearchProviderSchema>;

export const WebSearchSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  domain: z.string(),
  snippet: z.string(),
  content: z.string().optional(),
  publishedAt: z.string().nullable(),
});
export type WebSearchSource = z.infer<typeof WebSearchSourceSchema>;

export const WebSearchOutputSchema = z.object({
  status: WebSearchStatusSchema,
  provider: WebSearchProviderSchema.nullable(),
  query: z.string(),
  sources: z.array(WebSearchSourceSchema).max(10),
  /** True when this result came from the bounded in-process cache. */
  cacheHit: z.boolean(),
  /** Human-readable operational status; never contains provider secrets. */
  message: z.string().optional(),
});
export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;
