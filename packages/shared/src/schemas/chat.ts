import { z } from 'zod';

import { SymbolSchema } from '../symbols';

export const ChatRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

/**
 * Provenance of a thread's `title`. `'llm'` = produced by `Title_Generator`
 * via the AI Gateway; `'fallback'` = deterministic local fallback (budget
 * skipped, empty LLM reply, or LLM error). `null` is reserved for legacy
 * rows that pre-date the `title_source` column.
 */
export const ChatTitleSourceSchema = z.union([z.literal('llm'), z.literal('fallback')]).nullable();
export type ChatTitleSource = z.infer<typeof ChatTitleSourceSchema>;

/**
 * Persisted chat thread metadata. Messages live in a separate table.
 */
export const ChatThreadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  titleSource: ChatTitleSourceSchema,
  pinnedSymbol: SymbolSchema.nullable(),
  modelOverride: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type ChatThread = z.infer<typeof ChatThreadSchema>;

/**
 * Persisted chat message. Free-form `content` is the rendered text; structured
 * tool-call data lives in `parts` so the UI can re-hydrate rich tool cards.
 */
export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  role: ChatRoleSchema,
  content: z.string(),
  /** Provider-agnostic JSON for tool calls / results / attachments. */
  parts: z.unknown().nullable(),
  createdAt: z.number().int(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
