// SPDX-License-Identifier: Apache-2.0

/**
 * Per-call memory wiring for Kestrel Mastra agents (Phase 1).
 *
 * - `memoryCallOptions()` — the per-call `memory: { thread, resource }` shape
 *   (resource = userId, strict user scoping).
 * - `seedWorkingMemoryFromSettings()` — one-time migration that writes
 *   Drizzle userSettings (defaultSymbol, language, timezone, chat model,
 *   per-domain default models, embedding model) into Mastra working memory.
 *   Idempotent: only writes when no working memory exists yet.
 * - `backfillThreadHistoryIfNeeded()` — one-time, per-thread copy of recent
 *   Drizzle chat history into Mastra storage so threads that predate the
 *   migration keep their context when the agent loads `lastMessages`.
 *
 * The old `loadMastraMemoryContext`/`serializeMastraMemoryContext` path in
 * `mastra/memory-context.ts` is replaced by native Mastra memory.
 */

import type { UserSettingsRow } from '@kestrel/db/schema';
import type { Memory } from '@mastra/memory';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import type { AgentMemoryOption } from '@mastra/core/agent';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { listMessages } from '../persistence';

const mlog = createCategorizedLogger('ai', { component: 'mastra-memory-context' });

/** Recent Drizzle history copied into Mastra storage on first use per thread. */
const BACKFILL_LIMIT = 40;

export interface MemoryCallOptionsArgs {
  userId: string;
  threadId: string;
  /** Optional thread title metadata (kept minimal; Kestrel owns titles). */
  title?: string;
}

/**
 * The per-call `memory` option: thread = conversation, resource = user.
 * Strict `resource = userId` prevents any cross-user leakage.
 */
export function memoryCallOptions(args: MemoryCallOptionsArgs): AgentMemoryOption {
  return {
    thread: args.title
      ? ({ id: args.threadId, title: args.title } as Partial<StorageThreadType> & {
          id: string;
        })
      : { id: args.threadId },
    resource: args.userId,
  };
}

// ---------------------------------------------------------------------------
// Working-memory seed migration
// ---------------------------------------------------------------------------

export interface WorkingMemorySeedArgs {
  memory: Memory;
  userId: string;
  threadId: string;
  settings: Partial<
    Pick<
      UserSettingsRow,
      | 'defaultSymbol'
      | 'language'
      | 'timezone'
      | 'chatModel'
      | 'defaultModels'
      | 'embeddingModel'
    >
  >;
}

function workingMemoryMarkdown(settings: WorkingMemorySeedArgs['settings']): string {
  const chatModel = settings.chatModel ?? 'default';
  const domainModels = settings.defaultModels
    ? Object.entries(settings.defaultModels)
        .filter(([, value]) => Boolean(value))
        .map(([domain, value]) => `- ${domain}: ${value}`)
        .join('\n')
    : '';
  return `# User Preferences
- **Default symbol**: ${settings.defaultSymbol ?? 'XAUUSD'}
- **Language**: ${settings.language ?? 'en'}
- **Timezone**: ${settings.timezone ?? 'UTC'}
- **Preferred chat model**: ${chatModel}
${domainModels ? `- **Preferred analysis models**:\n${domainModels}` : ''}
- **Embedding model**: ${settings.embeddingModel ?? 'default'}
`;
}

/**
 * One-time working-memory seed from Drizzle userSettings. Resource-scoped, so
 * it is written once per user and preserved across threads; the agent then
 * owns updates. No-op when working memory already exists.
 */
export async function seedWorkingMemoryFromSettings(
  args: WorkingMemorySeedArgs,
): Promise<boolean> {
  const { memory, userId, threadId, settings } = args;
  try {
    const existing = await memory.getWorkingMemory({ threadId, resourceId: userId });
    if (existing) return false;
    await memory.updateWorkingMemory({
      threadId,
      resourceId: userId,
      workingMemory: workingMemoryMarkdown(settings),
    });
    mlog.info('Seeded working memory from Drizzle settings', { userId });
    return true;
  } catch (error) {
    // Memory is a context aid, never a hard dependency: degrade gracefully.
    mlog.warn('Working-memory seed skipped (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Thread-history backfill (pre-migration threads)
// ---------------------------------------------------------------------------

const BACKFILL_ROLES: ReadonlySet<string> = new Set(['user', 'assistant', 'system']);

function toMastraMessage(
  row: { id: string; role: string; content: string; createdAt: number },
  userId: string,
  threadId: string,
): MastraDBMessage {
  return {
    id: row.id,
    role: (BACKFILL_ROLES.has(row.role) ? row.role : 'system') as MastraDBMessage['role'],
    content: {
      format: 2,
      parts: [{ type: 'text', text: row.content }],
    },
    createdAt: new Date(row.createdAt),
    threadId,
    resourceId: userId,
  };
}

/**
 * One-time, per-thread backfill: when a thread has no messages in Mastra
 * storage yet but Drizzle does (a pre-migration thread), copy the recent
 * window so `lastMessages` has context. Idempotent — checks Mastra storage
 * first; best-effort — failures degrade to empty context, never block the
 * turn.
 */
export async function backfillThreadHistoryIfNeeded(args: {
  memory: Memory;
  userId: string;
  threadId: string;
}): Promise<number> {
  const { memory, userId, threadId } = args;
  try {
    // recall() validates the thread belongs to the resource, so pre-migration
    // threads must exist in Mastra storage first. Idempotent: `saveThread`
    // upserts on the primary key.
    const existingThread = await memory.getThreadById({ threadId, resourceId: userId });
    if (!existingThread) {
      await memory.createThread({ threadId, resourceId: userId, title: 'Kestrel thread' });
    }
    const existing = await memory.recall({ threadId, resourceId: userId, perPage: 1 });
    if (existing.messages.length > 0) return 0;
    const rows = await listMessages(userId, threadId, BACKFILL_LIMIT);
    if (rows.length === 0) return 0;
    await memory.saveMessages({
      messages: rows.map((row) => toMastraMessage(row, userId, threadId)),
    });
    mlog.info('Backfilled thread history into Mastra memory', {
      userId,
      threadId,
      count: rows.length,
    });
    return rows.length;
  } catch (error) {
    mlog.warn('Thread-history backfill skipped (non-fatal)', {
      threadId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Combined per-request preparation
// ---------------------------------------------------------------------------

export interface PrepareKestrelMemoryArgs {
  memory: Memory;
  userId: string;
  threadId: string;
  settings: WorkingMemorySeedArgs['settings'];
  /** When true, also backfill pre-migration thread history. */
  backfill?: boolean;
}

export interface PreparedKestrelMemory {
  callOptions: AgentMemoryOption;
  seededWorkingMemory: boolean;
  backfilledMessages: number;
}

/**
 * Prepare everything a request needs for native Mastra memory in one call:
 * per-call options + one-time working-memory seed + optional thread backfill.
 * All steps are idempotent and degrade gracefully.
 */
export async function prepareKestrelMemory(
  args: PrepareKestrelMemoryArgs,
): Promise<PreparedKestrelMemory> {
  const callOptions = memoryCallOptions({ userId: args.userId, threadId: args.threadId });
  const seededWorkingMemory = await seedWorkingMemoryFromSettings({
    memory: args.memory,
    userId: args.userId,
    threadId: args.threadId,
    settings: args.settings,
  });
  const backfilledMessages =
    args.backfill === true
      ? await backfillThreadHistoryIfNeeded({
          memory: args.memory,
          userId: args.userId,
          threadId: args.threadId,
        })
      : 0;
  return { callOptions, seededWorkingMemory, backfilledMessages };
}
