// Tool: search_knowledge.
//
// Phase 7b — hybrid retrieval over the news corpus PLUS optional
// recall against the memory index (journal, briefings, thread synopses):
//
//   1. Dense cosine over `news_embeddings`.
//   2. Postgres FTS over `news_articles.title || summary`.
//   3. Reciprocal-rank fusion of (1) + (2), then time-decayed by a
//      configurable halflife.
//   4. When `kinds` includes any non-`news` value, the memory index is
//      queried with the same embedding and the rows are RRF-fused into
//      the final ranking.
//
// The agent uses this for "what's been said about X recently" (news) and
// for "have we journaled anything similar" (memory). Empty corpora are
// surfaced via `pipelinePending: true` so the chat part can show a helpful
// status line instead of a misleading "no results".

import {
  SearchKnowledgeInputSchema,
  type SearchKnowledgeOutput,
} from '@hamafx/shared';
import { tool } from 'ai';
import { z } from 'zod';

import {
  countEmbeddings,
  embedQuery,
  memoryRowToItem,
  ragRowToItem,
  runMemoryQuery,
  runRagQuery,
} from '../rag';
import { countMemory, type MemoryKind } from '../memory/memory-index';

// We extend the published input schema with the optional `kinds` filter
// without breaking existing callers — the original input parses fine
// because the new field is optional. The DSL enum is restricted to the
// stable `MemoryKind` set so the agent can't ask for arbitrary buckets.
const SearchKindsSchema = z.array(
  z.enum(['news', 'journal', 'briefing', 'thread_synopsis']),
);

const InputSchema = SearchKnowledgeInputSchema.extend({
  kinds: SearchKindsSchema.optional(),
  /**
   * Halflife for time-decayed scoring, in days. Defaults to 7 days for
   * news, 30 days for memory recall. When the agent is digging through
   * older context it can bump this.
   */
  halflifeDays: z.number().min(0.5).max(365).optional(),
});

declare module '@hamafx/shared' {
  interface ToolIOMap {
    search_knowledge: { input: z.infer<typeof InputSchema> };
  }
}

const FALLBACK_MODEL = 'openai/text-embedding-3-small';

export const searchKnowledgeTool = tool({
  description:
    "Hybrid search across recent news AND your own journal entries / past briefings / saved thread synopses. Returns the top-K matches with cosine similarity in [0, 1] (1 = identical) and a deterministic time-decay applied. Use for 'what's been said about X' (news) or 'have we journaled anything similar' (memory). Filters: optional `since` (ms epoch), `symbol`, `kinds` (defaults to news only), `halflifeDays`. Returns an empty list with `pipelinePending: true` when the relevant corpus is empty.",
  inputSchema: InputSchema,
  execute: async ({
    query,
    since,
    symbol,
    limit,
    kinds,
    halflifeDays,
  }): Promise<SearchKnowledgeOutput> => {
    const kindSet = new Set<string>(kinds ?? ['news']);
    const wantsNews = kindSet.has('news');
    const memoryKinds: MemoryKind[] = (kinds ?? [])
      .filter((k): k is MemoryKind => k === 'journal' || k === 'briefing' || k === 'thread_synopsis');

    if (!wantsNews && memoryKinds.length === 0) {
      // Nothing to search — defensive default, the input schema's enum
      // already rules out empty `kinds`.
      return { items: [], model: FALLBACK_MODEL, pipelinePending: true };
    }

    // Probe corpora before paying for an embed call when both are empty.
    const [newsCount, memoryCount] = await Promise.all([
      wantsNews ? countEmbeddings() : Promise.resolve(0),
      memoryKinds.length > 0 ? countMemory() : Promise.resolve(0),
    ]);
    if (
      (wantsNews && newsCount === 0 && memoryKinds.length === 0) ||
      (memoryKinds.length > 0 && memoryCount === 0 && !wantsNews)
    ) {
      return { items: [], model: FALLBACK_MODEL, pipelinePending: true };
    }

    const { embedding, model } = await embedQuery(query);

    const [newsRows, memoryRows] = await Promise.all([
      wantsNews && newsCount > 0
        ? runRagQuery({
            embedding,
            limit,
            query,
            ...(since !== undefined ? { since } : {}),
            ...(symbol !== undefined ? { symbol } : {}),
            ...(halflifeDays !== undefined ? { halflifeDays } : {}),
          })
        : Promise.resolve([]),
      memoryKinds.length > 0 && memoryCount > 0
        ? runMemoryQuery({
            embedding,
            limit,
            kinds: memoryKinds,
            ...(since !== undefined ? { since } : {}),
            ...(symbol !== undefined ? { symbol } : {}),
            ...(halflifeDays !== undefined ? { halflifeDays: halflifeDays * 4 } : {}),
          })
        : Promise.resolve([]),
    ]);

    const merged = [
      ...newsRows.map(ragRowToItem),
      ...memoryRows.map(memoryRowToItem),
    ].sort((a, b) => b.similarity - a.similarity);

    return {
      items: merged.slice(0, limit),
      model,
      pipelinePending: merged.length === 0,
    };
  },
});
