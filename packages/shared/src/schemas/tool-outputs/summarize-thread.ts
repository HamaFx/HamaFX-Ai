// Output envelope returned by the `summarize_thread` AI tool.
//
// Synopsis of the active chat thread plus three durable insights tagged
// for retrieval. The agent calls this when the user asks "wrap this up"
// / "what did we conclude" / "give me a TL;DR" — the output is then
// embedded into `memory_embeddings` so future turns can recall it.
//
// Source of truth: packages/ai/src/tools/summarize-thread.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';

export const SummarizeThreadInputSchema = z.object({
  /**
   * Maximum number of messages to consider from the active thread.
   * Older messages outside this window contribute through the rolling
   * thread summary already prepended to the system prompt.
   */
  messageWindow: z.number().int().min(4).max(60).default(30),
  /** When true, the synopsis is also embedded into `memory_embeddings`. */
  remember: z.boolean().default(true),
});
export type SummarizeThreadInput = z.infer<typeof SummarizeThreadInputSchema>;

export const ThreadInsightSchema = z.object({
  /** Short imperative sentence the agent can echo verbatim. */
  text: z.string(),
  /** Optional symbol context attached to this insight. */
  symbol: SymbolSchema.nullable(),
});
export type ThreadInsight = z.infer<typeof ThreadInsightSchema>;

export const SummarizeThreadOutputSchema = z.object({
  threadId: z.string().uuid(),
  asOf: z.number().int(),
  /** One-paragraph synopsis suitable as a retrieval payload. */
  synopsis: z.string(),
  insights: z.array(ThreadInsightSchema),
  /** True when the synopsis was persisted into `memory_embeddings`. */
  remembered: z.boolean(),
});
export type SummarizeThreadOutput = z.infer<typeof SummarizeThreadOutputSchema>;
