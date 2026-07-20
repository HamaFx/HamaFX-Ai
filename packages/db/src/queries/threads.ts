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

// PF-01 — Thread query helpers.
//
// Encapsulates common thread + message queries previously inlined
// across @hamafx/ai consumers. Using these helpers instead of
// importing `schema` directly decouples callers from Drizzle ORM
// internals and makes the query patterns consistent.

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

// ── Types ──────────────────────────────────────────────────────────────

export interface ThreadRow {
  id: string;
  userId: string;
  title: string | null;
  pinnedSymbol: string | null;
  modelOverride: string | null;
  titleSource: string | null;
  isBriefings: boolean;
  analysisMode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  threadId: string;
  role: string;
  content: string;
  parts: unknown;
  createdAt: Date;
}

export interface CreateThreadInput {
  userId: string;
  title?: string | null;
  pinnedSymbol?: string | null;
  modelOverride?: string | null;
  analysisMode?: string | null;
  isBriefings?: boolean;
}

export interface CreateMessageInput {
  threadId: string;
  role: string;
  content: string;
  parts?: unknown;
}

// ── Thread queries ──────────────────────────────────────────────────────

/**
 * Get a single thread by ID, scoped to the user.
 */
export async function getThread(
  userId: string,
  threadId: string,
): Promise<ThreadRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * List threads for a user, ordered by most recently updated.
 */
export async function listThreads(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<ThreadRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.chatThreads)
    .where(eq(schema.chatThreads.userId, userId))
    .orderBy(desc(schema.chatThreads.updatedAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Create a new chat thread.
 */
export async function createThread(
  input: CreateThreadInput,
): Promise<ThreadRow> {
  const db = getDb();
  const rows = await db
    .insert(schema.chatThreads)
    .values({
      userId: input.userId,
      title: input.title ?? null,
      pinnedSymbol: input.pinnedSymbol ?? null,
      modelOverride: input.modelOverride ?? null,
      analysisMode: input.analysisMode ?? null,
      isBriefings: input.isBriefings ?? false,
    })
    .returning();
  return rows[0]!;
}

/**
 * Update a thread's title and title source.
 */
export async function updateThreadTitle(
  threadId: string,
  title: string,
  titleSource: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.chatThreads)
    .set({ title, titleSource, updatedAt: sql`now()` })
    .where(eq(schema.chatThreads.id, threadId));
}

/**
 * Update a thread's pinned symbol.
 */
export async function updateThreadPinnedSymbol(
  threadId: string,
  pinnedSymbol: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.chatThreads)
    .set({ pinnedSymbol, updatedAt: sql`now()` })
    .where(eq(schema.chatThreads.id, threadId));
}

/**
 * Delete a thread by ID, scoped to the user.
 */
export async function deleteThread(
  userId: string,
  threadId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
      ),
    );
}

/**
 * Batch-delete multiple threads for a user. Returns the deleted thread IDs.
 * Threads not belonging to the user are silently skipped.
 */
export async function batchDeleteThreads(
  userId: string,
  ids: string[],
): Promise<{ id: string }[]> {
  const db = getDb();
  return db
    .delete(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.userId, userId),
        inArray(schema.chatThreads.id, ids),
      ),
    )
    .returning({ id: schema.chatThreads.id });
}

// ── Message queries ────────────────────────────────────────────────────

/**
 * List messages for a thread, oldest first.
 */
export async function listMessages(
  threadId: string,
  limit: number = 100,
): Promise<MessageRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.threadId, threadId))
    .orderBy(schema.chatMessages.createdAt)
    .limit(limit);
}

/**
 * Append a user message to a thread.
 */
export async function appendUserMessage(
  threadId: string,
  content: string,
  parts?: unknown,
): Promise<MessageRow> {
  const db = getDb();
  const rows = await db
    .insert(schema.chatMessages)
    .values({
      threadId,
      role: 'user',
      content,
      ...(parts ? { parts } : {}),
    })
    .returning();
  return rows[0]!;
}

/**
 * Append an assistant message to a thread.
 */
export async function appendAssistantMessage(
  threadId: string,
  content: string,
  parts?: unknown,
): Promise<MessageRow> {
  const db = getDb();
  const rows = await db
    .insert(schema.chatMessages)
    .values({
      threadId,
      role: 'assistant',
      content,
      ...(parts ? { parts } : {}),
    })
    .returning();
  return rows[0]!;
}

/**
 * Count messages in a thread.
 */
export async function countThreadMessages(threadId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.threadId, threadId));
  return Number(result[0]?.count ?? 0);
}
