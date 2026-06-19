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

// Embedding helper. Sits behind the AI Gateway so the same model spec works
// in dev and prod ("openai/text-embedding-3-small" by default; switchable
// via env). The default model outputs 1536 dimensions — matches the
// `news_embeddings.embedding` column.
//
// We use AI SDK's top-level `embedMany` helper (v5) which:
//   - calls the provider with the right batching
//   - returns numeric arrays we can pass straight into pgvector
//
// Rate-limit handling is delegated to the gateway — there's no per-provider
// throttle here. If we later need to cap spend on embeddings specifically,
// add a counter alongside `chat_telemetry`.

import type { ServerEnv } from '@hamafx/shared';
import { embedMany } from 'ai';

const DEFAULT_MODEL = 'openai/text-embedding-3-small';

export interface EmbedTextsArgs {
  texts: string[];
  /**
   * Override the model. Defaults to env.AI_EMBEDDING_MODEL or
   * "openai/text-embedding-3-small". Caller is responsible for ensuring
   * the dimension matches the DB column when changing models.
   */
  model?: string;
  env?: Pick<ServerEnv, 'AI_EMBEDDING_MODEL'>;
  signal?: AbortSignal;
}

export interface EmbedResult {
  /** One float[] per input text, same order. */
  embeddings: number[][];
  model: string;
  /** AI SDK reports tokens at batch level. */
  inputTokens: number;
}

export async function embedTexts(args: EmbedTextsArgs): Promise<EmbedResult> {
  const model = args.model ?? args.env?.AI_EMBEDDING_MODEL ?? DEFAULT_MODEL;

  // AI SDK v5 expects either a model instance or a model string when the
  // gateway is configured globally via AI_GATEWAY_API_KEY.
  const callArgs: Parameters<typeof embedMany>[0] = {
    model,
    values: args.texts,
  };
  if (args.signal) callArgs.abortSignal = args.signal;

  const result = await embedMany(callArgs);

  return {
    embeddings: result.embeddings as number[][],
    model,
    inputTokens: result.usage?.tokens ?? 0,
  };
}

/**
 * Format an embedding as the `pgvector` literal `[v1,v2,…,vN]`. Used by
 * `searchMemory` and `runDenseNewsQuery` when binding the vector into a
 * `<=>` (cosine-distance) operator. Centralised here (Phase 3 hardening
 * §20) so the format stays consistent if pgvector ever tightens its
 * grammar — and so a typo doesn't drift between the two call sites.
 */
export function vectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}
