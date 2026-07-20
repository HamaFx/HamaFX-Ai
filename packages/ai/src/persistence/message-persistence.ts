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

// P1 — Message persistence (SRP split from persistence.ts).
// Message CRUD + parts stripping. Thread and telemetry live in their own modules.

import { getDb, schema } from '@hamafx/db';
import { getMessageText } from '@hamafx/shared';
import type { UIMessage } from 'ai';
import { asc, eq } from 'drizzle-orm';

import { getThread } from './thread-persistence';

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface DbMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Vercel AI SDK v5 message-parts JSON (tool calls, tool results, etc.). */
  parts: unknown;
  createdAt: number;
}

export async function listMessages(userId: string, threadId: string, limit = 200): Promise<DbMessage[]> {
  const thread = await getThread(userId, threadId);
  if (!thread) return [];
  const rows = await getDb()
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.threadId, threadId))
    .orderBy(asc(schema.chatMessages.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    role: r.role as DbMessage['role'],
    content: r.content,
    parts: r.parts,
    createdAt: r.createdAt.getTime(),
  }));
}

export async function appendUserMessage(threadId: string, message: UIMessage): Promise<void> {
  const text = extractText(message);
  await getDb().transaction(async (tx) => {
    await tx.insert(schema.chatMessages).values({
      threadId,
      role: 'user',
      content: text,
      parts: stripPartsForStorage(message.parts ?? null),
    });
    await tx
      .update(schema.chatThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.chatThreads.id, threadId));
  });
}

export async function appendAssistantMessage(
  threadId: string,
  message: UIMessage,
): Promise<{ messageId: string }> {
  const text = extractText(message);
  return getDb().transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.chatMessages)
      .values({
        threadId,
        role: 'assistant',
        content: text,
        parts: stripPartsForStorage(message.parts ?? null),
      })
      .returning({ id: schema.chatMessages.id });
    await tx
      .update(schema.chatThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.chatThreads.id, threadId));
    return { messageId: inserted[0]!.id };
  });
}

// ---------------------------------------------------------------------------
// Parts stripping
// ---------------------------------------------------------------------------

const STRIP_FIELDS: ReadonlySet<string> = new Set([
  'imageDataUrl',
  'image',
  'data',
  'candles',
  'rawResponse',
]);

function stripPartsForStorage(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts;
  return parts.map((p) => {
    if (p === null || typeof p !== 'object' || !('type' in (p as Record<string, unknown>))) return p;
    const part = p as { type: unknown; output?: unknown };
    if (part.type !== 'tool-result' || typeof part.output !== 'object' || part.output === null) return p;
    const output = part.output as Record<string, unknown>;
    let modified = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(output)) {
      if (STRIP_FIELDS.has(k)) { next[k] = '[stripped]'; modified = true; continue; }
      next[k] = v;
    }
    return modified ? { ...part, output: next } : p;
  });
}

function extractText(m: UIMessage): string {
  return getMessageText(m);
}
