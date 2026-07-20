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

// P1 — Thread persistence (SRP split from persistence.ts).
// Thread CRUD + fork logic. Messages and telemetry live in their own modules.

import { getDb, schema } from '@hamafx/db';
import type { Symbol } from '@hamafx/shared';
import { and, asc, desc, eq, lt } from 'drizzle-orm';

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
  createdAt: number;
  updatedAt: number;
}

export async function listThreads(
  userId: string,
  limit = 50,
  beforeUpdatedAt?: number | null,
): Promise<{ threads: DbThread[]; nextCursor: number | null }> {
  const query = getDb()
    .select()
    .from(schema.chatThreads)
    .where(
      beforeUpdatedAt
        ? and(
            eq(schema.chatThreads.userId, userId),
            lt(schema.chatThreads.updatedAt, new Date(beforeUpdatedAt)),
          )
        : eq(schema.chatThreads.userId, userId),
    )
    .orderBy(desc(schema.chatThreads.updatedAt))
    .limit(limit + 1);

  const rows = await query;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const threads = pageRows.map(rowToThread);
  const nextCursor = hasMore ? (threads[threads.length - 1]?.updatedAt ?? null) : null;
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
    .orderBy(asc(schema.chatMessages.createdAt));

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
