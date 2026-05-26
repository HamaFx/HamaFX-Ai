// Tool: search_knowledge.
//
// Cosine-similarity search over `news_embeddings` (pgvector HNSW). Returns
// the top-K matching articles with their similarity scores, source meta,
// and sentiment. Empty index → fast-path return without an embed call.

import {
  SearchKnowledgeInputSchema,
  type SearchKnowledgeOutput,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

import { countEmbeddings, embedQuery, ragRowToItem, runRagQuery } from '../rag';

const InputSchema = SearchKnowledgeInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    search_knowledge: { input: z.infer<typeof InputSchema> };
  }
}

const FALLBACK_MODEL = 'openai/text-embedding-3-small';

export const searchKnowledgeTool = tool({
  description:
    "Search the news embeddings index for the top-K articles most semantically similar to a query. Returns sourced items with cosine similarity in [0, 1] (1 = identical). Use when the user asks 'what's been said about X' or wants thematic context across recent news. Filters: optional `since` (ms epoch lower bound on publication) and `symbol` (any-of the article's symbol tags). Returns an empty list with `pipelinePending: true` when the embedding index hasn't been populated yet.",
  inputSchema: InputSchema,
  execute: async ({ query, since, symbol, limit }): Promise<SearchKnowledgeOutput> => {
    const populated = await countEmbeddings();
    if (populated === 0) {
      return { items: [], model: FALLBACK_MODEL, pipelinePending: true };
    }

    const { embedding, model } = await embedQuery(query);
    const rows = await runRagQuery({
      embedding,
      limit,
      ...(since !== undefined ? { since } : {}),
      ...(symbol !== undefined ? { symbol } : {}),
    });

    return {
      items: rows.map(ragRowToItem),
      model,
      pipelinePending: false,
    };
  },
});
