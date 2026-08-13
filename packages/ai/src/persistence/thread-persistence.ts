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

// P1 — Thread persistence (SRP split from persistence.ts).
// Thread CRUD + fork logic. Messages and telemetry live in their own modules.

import { schema } from '@kestrel/db';
import { getDb } from '../db';
import type { Symbol } from '@kestrel/shared';
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export interface DbThread {
  id: string;
  title: string | null;
  /**
   * Provenance of `title`: `'llm'` = produced by `Title_Generator`,
   * `'fallback'` = deterministic local fallback, `null` = legacy row created
   * before the `title_source` column existed.
   */
  titleSource: 'llm' | 'fallback' | null;
  pinnedSymbol: Symbol | null;
  modelOverride: string | null;
  analysisMode: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadCursor {
  updatedAt: number;
  id?: string;
}

export class InvalidThreadCursorError extends Error {
  readonly statusCode = 400;

  constructor() {
    super('Invalid thread pagination cursor');
    this.name = 'InvalidThreadCursorError';
  }
}

/** Opaque cursor format: `<updatedAt milliseconds>|<thread UUID>`. */
function encodeThreadCursor(cursor: ThreadCursor): string {
  return `${cursor.updatedAt}|${cursor.id}`;
}

function decodeThreadCursor(value: string | number | null | undefined): ThreadCursor | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  const separator = raw.indexOf('|');
  const timestampText = separator === -1 ? raw : raw.slice(0, separator);
  const updatedAt = Number(timestampText);
  if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) throw new InvalidThreadCursorError();
  if (separator === -1) return { updatedAt };

  const id = raw.slice(separator + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new InvalidThreadCursorError();
  }
  return { updatedAt, id };
}

export async function listThreads(
  userId: string,
  limit = 50,
  beforeCursor?: string | number | null,
): Promise<{ threads: DbThread[]; nextCursor: string | null }> {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit) || 50, 100));
  const cursor = decodeThreadCursor(beforeCursor);
  const userFilter = eq(schema.chatThreads.userId, userId);
  // PostgreSQL timestamps have microsecond precision while JavaScript Dates
  // have milliseconds. Paginate on the same millisecond bucket that is
  // encoded in the cursor, then use the UUID tie-breaker within that bucket.
  const updatedAtBucket = sql`date_trunc('milliseconds', ${schema.chatThreads.updatedAt})`;
  const cursorFilter = cursor
    ? cursor.id
      ? or(
          lt(updatedAtBucket, new Date(cursor.updatedAt)),
          and(
            eq(updatedAtBucket, new Date(cursor.updatedAt)),
            lt(schema.chatThreads.id, cursor.id),
          ),
        )
      : lt(updatedAtBucket, new Date(cursor.updatedAt))
    : undefined;

  const query = getDb()
    .select()
    .from(schema.chatThreads)
    .where(cursorFilter ? and(userFilter, cursorFilter) : userFilter)
    .orderBy(desc(updatedAtBucket), desc(schema.chatThreads.id))
    .limit(boundedLimit + 1);

  const rows = await query;
  const hasMore = rows.length > boundedLimit;
  const pageRows = hasMore ? rows.slice(0, boundedLimit) : rows;
  const threads = pageRows.map(rowToThread);
  const last = threads[threads.length - 1];
  const nextCursor = hasMore && last ? encodeThreadCursor({ updatedAt: last.updatedAt, id: last.id }) : null;
  return { threads, nextCursor };
}

export async function getThread(userId: string, id: string): Promise<DbThread | null> {
  const rows = await getDb()
    .select()
    .from(schema.chatThreads)
    .where(and(eq(schema.chatThreads.id, id), eq(schema.chatThreads.userId, userId)))
    .limit(1);
  const row = rows[0];
  return row ? rowToThread(row) : null;
}

export async function createThread(
  userId: string,
  opts: { pinnedSymbol?: Symbol | null } = {},
): Promise<DbThread> {
  const inserted = await getDb()
    .insert(schema.chatThreads)
    .values({
      userId,
      title: null,
      pinnedSymbol: opts.pinnedSymbol ?? null,
      modelOverride: null,
      // Null means use the user's saved default mode. Existing rows with
      // `single` retain their legacy behavior until explicitly changed.
      analysisMode: null,
    })
    .returning();
  const row = inserted[0]!;
  return rowToThread(row);
}

export async function updateThreadTitle(
  id: string,
  title: string,
  source: 'llm' | 'fallback',
): Promise<void> {
  await getDb()
    .update(schema.chatThreads)
    .set({ title, titleSource: source })
    .where(eq(schema.chatThreads.id, id));
}

export async function updateThreadPinnedSymbol(
  userId: string,
  id: string,
  pinnedSymbol: Symbol | null,
): Promise<boolean> {
  const updated = await getDb()
    .update(schema.chatThreads)
    .set({ pinnedSymbol, updatedAt: new Date() })
    .where(and(eq(schema.chatThreads.id, id), eq(schema.chatThreads.userId, userId)))
    .returning({ id: schema.chatThreads.id });
  return updated.length > 0;
}

export async function updateThreadAnalysisMode(
  userId: string,
  id: string,
  analysisMode: string | null,
): Promise<boolean> {
  const updated = await getDb()
    .update(schema.chatThreads)
    .set({ analysisMode, updatedAt: new Date() })
    .where(and(eq(schema.chatThreads.id, id), eq(schema.chatThreads.userId, userId)))
    .returning({ id: schema.chatThreads.id });
  return updated.length > 0;
}

export async function deleteThread(userId: string, id: string): Promise<void> {
  await getDb()
    .delete(schema.chatThreads)
    .where(and(eq(schema.chatThreads.id, id), eq(schema.chatThreads.userId, userId)));
}

export async function deleteAllThreads(userId: string): Promise<void> {
  await getDb()
    .delete(schema.chatThreads)
    .where(eq(schema.chatThreads.userId, userId));
}

function rowToThread(row: typeof schema.chatThreads.$inferSelect): DbThread {
  const rawSource = row.titleSource;
  const titleSource: DbThread['titleSource'] =
    rawSource === 'llm' || rawSource === 'fallback' ? rawSource : null;
  return {
    id: row.id,
    title: row.title,
    titleSource,
    pinnedSymbol: row.pinnedSymbol as Symbol | null,
    modelOverride: row.modelOverride,
    analysisMode: row.analysisMode,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Fork
// ---------------------------------------------------------------------------

export function deriveForkedTitle(newText: string): string {
  const trimmed = newText.trim();
  if (trimmed.length === 0) return 'New chat';
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 79).trimEnd() + '…';
}

const MAX_FORK_MESSAGES = 1000;

export interface ForkThreadInput {
  userId: string;
  sourceThreadId: string;
  atMessageId: string;
  newText: string;
}

export interface ForkThreadResult {
  newThreadId: string;
  firstMessage: { id: string; role: 'user'; content: string };
}

export async function forkThread(input: ForkThreadInput): Promise<ForkThreadResult> {
  const { userId, sourceThreadId, atMessageId, newText } = input;

  const [source] = await getDb()
    .select()
    .from(schema.chatThreads)
    .where(and(eq(schema.chatThreads.id, sourceThreadId), eq(schema.chatThreads.userId, userId)))
    .limit(1);
  if (!source) throw new Error(`thread not found: ${sourceThreadId}`);

  const sourceMessages = await getDb()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.threadId, sourceThreadId))
    .orderBy(asc(schema.chatMessages.createdAt), asc(schema.chatMessages.id))
    .limit(MAX_FORK_MESSAGES + 1);
  if (sourceMessages.length > MAX_FORK_MESSAGES) {
    throw new Error(`thread is too long to fork (maximum ${MAX_FORK_MESSAGES} messages)`);
  }

  const editIdx = sourceMessages.findIndex((m) => m.id === atMessageId);
  if (editIdx === -1) throw new Error(`message not found: ${atMessageId}`);
  const target = sourceMessages[editIdx]!;
  if (target.role !== 'user') throw new Error(`can only edit user messages, got role=${target.role}`);

  const newTitle = deriveForkedTitle(newText);
  return getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.chatThreads)
      .values({
        userId,
        title: newTitle,
        pinnedSymbol: source.pinnedSymbol ?? null,
        analysisMode: null,
      })
      .returning({ id: schema.chatThreads.id });
    const newThreadId = created!.id;

    const cut = sourceMessages.slice(0, editIdx + 1);
    const rows = cut.map((m, i) => ({
      threadId: newThreadId,
      role: m.role,
      content: i === editIdx ? newText : m.content,
      parts: m.parts ?? null,
      createdAt: m.createdAt,
    }));
    const inserted = await tx
      .insert(schema.chatMessages)
      .values(rows)
      .returning({ id: schema.chatMessages.id, role: schema.chatMessages.role, content: schema.chatMessages.content });
    const insertedIds = inserted.map((r) => r!.id);
    await tx
      .update(schema.chatThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.chatThreads.id, newThreadId));

    return { newThreadId, firstMessage: { id: insertedIds[0]!, role: 'user' as const, content: newText } };
  });
}
