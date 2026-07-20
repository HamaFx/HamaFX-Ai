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

// PF-22 — Chat threads service layer.
//
// Handles chat thread CRUD operations. The streaming chat POST endpoint
// (/api/chat) remains a thick controller because its logic (SSE streaming,
// multi-agent dispatch, budget enforcement) is inherently HTTP-coupled.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import {
  createThread as aiCreateThread,
  listThreads as aiListThreads,
  getThread as aiGetThread,
  deleteThread as aiDeleteThread,
  updateThreadPinnedSymbol,
  listMessages as aiListMessages,
} from '@hamafx/ai';
import type { DbThread } from '@hamafx/ai';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface ThreadDTO {
  id: string;
  userId: string;
  title: string | null;
  pinnedSymbol: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThreadListResult {
  threads: ThreadDTO[];
  nextCursor: number | null;
}

export interface ThreadWithMessagesResult {
  thread: ThreadDTO;
  messages: unknown[];
}

// ── DTO mappers ──────────────────────────────────────────────────────────────

/** Map domain DbThread → ThreadDTO (number timestamps → Date objects, userId injected by caller). */
function toThreadDTO(t: DbThread, userId: string): ThreadDTO {
  return {
    id: t.id,
    userId,
    title: t.title,
    pinnedSymbol: t.pinnedSymbol,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
  };
}

// ── Service functions ────────────────────────────────────────────────────────

export async function listThreadsService(
  userId: string,
  limit = 50,
  beforeMs: number | null = null,
): Promise<ThreadListResult> {
  const { threads, nextCursor } = await aiListThreads(userId, limit, beforeMs);
  return { threads: threads.map((t) => toThreadDTO(t, userId)), nextCursor };
}

export async function createThreadService(
  userId: string,
  pinnedSymbol: string | null,
): Promise<{ thread: ThreadDTO }> {
  const thread = await aiCreateThread(userId, { pinnedSymbol });
  return { thread: toThreadDTO(thread, userId) };
}

export async function getThreadService(
  userId: string,
  id: string,
): Promise<ThreadDTO | null> {
  const thread = await aiGetThread(userId, id);
  return thread ? toThreadDTO(thread, userId) : null;
}

export async function getThreadWithMessagesService(
  userId: string,
  id: string,
): Promise<ThreadWithMessagesResult | null> {
  const thread = await aiGetThread(userId, id);
  if (!thread) return null;
  const messages = await aiListMessages(userId, id);
  return { thread: toThreadDTO(thread, userId), messages };
}

export async function deleteThreadService(userId: string, id: string): Promise<void> {
  await aiDeleteThread(userId, id);
}

export async function updateThreadPinnedSymbolService(
  userId: string,
  id: string,
  pinnedSymbol: string | null,
): Promise<boolean> {
  return updateThreadPinnedSymbol(userId, id, pinnedSymbol);
}
