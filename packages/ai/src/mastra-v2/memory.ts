// SPDX-License-Identifier: Apache-2.0

/**
 * Kestrel Mastra Memory (Phase 1).
 *
 * One Memory instance per request, sharing the Phase 0 storage and vector
 * stores. The embedder is BYOK per-user, so the Memory wrapper must be built
 * per request (exactly like agents are built per request with the user's
 * BYOK chat model). The storage composite and vector store are process-wide
 * singletons and never re-created per request.
 *
 * Layers:
 * - message history (lastMessages: 20) — the agent's thread context
 * - working memory (resource-scoped markdown preferences) — seeded once from
 *   Drizzle userSettings by `./context.ts`
 * - semantic recall — BYOK embedding model via the existing resolver,
 *   gated by `ENABLE_MASTRA_SEMANTIC_RECALL` (default on)
 * - observational memory — gated by `ENABLE_MASTRA_OBSERVATIONAL_MEMORY`
 *   (default off; best enabled on long-lived worker/durable paths, not
 *   short-lived Vercel functions, because it spawns background agents)
 *
 * The old `ENABLE_MASTRA_MEMORY` flag is retired: memory is now always on
 * for Mastra paths.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import { LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { PgVector } from '@mastra/pg';
import type { MemoryConfigInternal } from '@mastra/core/memory';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { MastraEmbeddingModel, MastraVector } from '@mastra/core/vector';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { embedTexts } from '../embeddings';
import { resolveEmbeddingModel } from '../model';
import type { ResolveModelEnv } from '../vertex-factory';
import { getKestrelMastra } from './instance';
import {
  mastraDirectConnectionString,
  mastraSslOptions,
  type MastraStorageKind,
} from './storage';

const mlog = createCategorizedLogger('ai', { component: 'mastra-memory' });

export const KESTREL_MEMORY_LAST_MESSAGES = 20;
export const KESTREL_MEMORY_SEMANTIC_TOP_K = 4;

/** Default working-memory template; seeded from Drizzle by `./context.ts`. */
export const KESTREL_WORKING_MEMORY_TEMPLATE = `# User Preferences
- **Default symbol**:
- **Language**:
- **Timezone**:
- **Preferred chat model**:
- **Preferred analysis models**:
- **Embedding model**:
`;

// ---------------------------------------------------------------------------
// Vector store (shared process-wide singleton)
// ---------------------------------------------------------------------------

function libsqlVectorUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.MASTRA_LIBSQL_URL;
  if (configured && configured.length > 0) return configured;
  return 'file:./.kestrel/mastra.db';
}

/**
 * Create the vector store for semantic recall, mirroring `createMastraStorage`
 * selection so dev (LibSQL file) and prod (Postgres + pgvector) stay aligned.
 */
export function createKestrelVectorStore(
  kind: MastraStorageKind,
  env: NodeJS.ProcessEnv = process.env,
): MastraVector {
  if (kind === 'postgres') {
    const connectionString = mastraDirectConnectionString(env);
    if (!connectionString) {
      throw new Error(
        '[mastra-memory] vector store requires DIRECT_URL, POSTGRES_URL_NON_POOLING, ' +
          'DATABASE_URL, or POSTGRES_URL to be set.',
      );
    }
    return new PgVector({
      id: 'kestrel-mastra-vector',
      connectionString,
      schemaName: env.MASTRA_SCHEMA ?? 'mastra',
      ssl: mastraSslOptions(env),
    });
  }
  return new LibSQLVector({ id: 'kestrel-mastra-vector', url: libsqlVectorUrl(env) });
}

let cachedVectorStore: MastraVector | null = null;

/** Process-wide vector-store singleton (created lazily). */
export function getKestrelVectorStore(
  kind: MastraStorageKind = 'libsql',
): MastraVector {
  cachedVectorStore ??= createKestrelVectorStore(kind);
  return cachedVectorStore;
}

/** Test helper — resets the singleton so tests can inject isolated stores. */
export function _resetKestrelVectorStore(): void {
  cachedVectorStore = null;
}

// ---------------------------------------------------------------------------
// BYOK embedder
// ---------------------------------------------------------------------------

export interface KestrelEmbedderArgs {
  settings: Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>;
  env: ResolveModelEnv;
}

/**
 * Wrap Kestrel's `embedTexts` (BYOK resolver + AI Gateway) as an AI SDK v5
 * EmbeddingModel so Mastra's semantic recall uses the user's own embedding
 * provider and key. Resolution priority is unchanged: user embeddingModel →
 * env.AI_EMBEDDING_MODEL → default.
 */
export function createKestrelEmbedder(args: KestrelEmbedderArgs): MastraEmbeddingModel<string> {
  const modelId = resolveEmbeddingModel(args.settings, args.env);
  const provider = modelId.split('/')[0] ?? 'kestrel-byok';
  return {
    specificationVersion: 'v2',
    provider,
    modelId,
    maxEmbeddingsPerCall: 256,
    supportsParallelCalls: false,
    async doEmbed({ values, abortSignal }) {
      const result = await embedTexts({
        texts: values,
        userSettings: args.settings,
        ...(args.env.AI_EMBEDDING_MODEL
          ? { env: { AI_EMBEDDING_MODEL: args.env.AI_EMBEDDING_MODEL } }
          : {}),
        ...(abortSignal ? { signal: abortSignal } : {}),
      });
      return {
        embeddings: result.embeddings,
        ...(result.inputTokens > 0 ? { usage: { tokens: result.inputTokens } } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Memory options
// ---------------------------------------------------------------------------

export interface KestrelMemoryOptionsArgs {
  env: ResolveModelEnv;
  /**
   * Force observational memory on regardless of the env var. Used by the
   * worker's durable Full-mode path where the process is long-lived and
   * background observation agents are appropriate.
   */
  forceObservationalMemory?: boolean;
}

/**
 * The memory configuration for Kestrel agents.
 *
 * - lastMessages: 20 recent messages from the current thread.
 * - workingMemory: resource-scoped markdown preferences (seeded once from
 *   Drizzle; agent-maintained afterwards).
 * - semanticRecall: on by default; scope 'resource' so recall spans the
 *   user's threads without crossing users. Disable with
 *   `ENABLE_MASTRA_SEMANTIC_RECALL=false`.
 * - observationalMemory: off by default; enable with
 *   `ENABLE_MASTRA_OBSERVATIONAL_MEMORY=true` on long-lived paths.
 */
export function kestrelMemoryOptions(
  args: KestrelMemoryOptionsArgs,
): MemoryConfigInternal {
  const semanticRecall =
    (process.env.ENABLE_MASTRA_SEMANTIC_RECALL ?? 'true') !== 'false'
      ? {
          topK: KESTREL_MEMORY_SEMANTIC_TOP_K,
          messageRange: { before: 1, after: 1 } as const,
          scope: 'resource' as const,
        }
      : false;
  const observationalMemory =
    args.forceObservationalMemory === true ||
    process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY === 'true'
      ? { scope: 'resource' as const }
      : false;
  return {
    lastMessages: KESTREL_MEMORY_LAST_MESSAGES,
    workingMemory: {
      enabled: true,
      scope: 'resource' as const,
      template: KESTREL_WORKING_MEMORY_TEMPLATE,
    },
    semanticRecall,
    observationalMemory,
  };
}

// ---------------------------------------------------------------------------
// Memory factory
// ---------------------------------------------------------------------------

export interface CreateKestrelMemoryArgs extends KestrelEmbedderArgs {
  /** Shared Phase 0 storage composite. Defaults to the Mastra instance's. */
  storage?: MastraCompositeStore;
  /** Shared vector store. Defaults to the process-wide singleton. */
  vector?: MastraVector;
  options?: MemoryConfigInternal;
}

/**
 * Build a per-request Memory instance over the shared storage/vector with a
 * BYOK embedder. The instance is cheap (config + shared stores); agents are
 * per-request too, so this matches the existing lifecycle.
 *
 * Storage defaults to the shared Kestrel Mastra instance's composite store so
 * the Memory never falls back to Mastra's ephemeral `file:memory.db` default.
 */
export function createKestrelMemory(args: CreateKestrelMemoryArgs): Memory {
  const vector = args.vector ?? getKestrelVectorStore();
  const options = args.options ?? kestrelMemoryOptions({ env: args.env });
  const storage = args.storage ?? getKestrelMastra().instance.getStorage();
  if (!storage) {
    throw new Error(
      '[mastra-memory] no storage available: configure Mastra storage on the shared ' +
        'instance (createKestrelMastra) or pass an explicit storage composite.',
    );
  }
  mlog.debug('Building Kestrel Memory instance', {
    embedderModel: resolveEmbeddingModel(args.settings, args.env),
    lastMessages: options?.lastMessages,
    semanticRecall: Boolean((options as { semanticRecall?: unknown })?.semanticRecall),
    workingMemory: Boolean((options as { workingMemory?: unknown })?.workingMemory),
  });
  return new Memory({
    storage,
    vector,
    embedder: createKestrelEmbedder(args),
    options,
  });
}
