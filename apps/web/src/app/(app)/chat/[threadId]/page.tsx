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

import type { UIMessage } from 'ai';
import { z } from 'zod';
// /chat/[threadId] — full-screen chat surface for a specific thread.
//
// Server component: validates the thread, hydrates the message history from
// Postgres, then hands off to the client `<ChatScreen>` for the streaming
// `useChat` experience.

import { getThread, listMessages, listThreads } from '@hamafx/ai';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { ChatScreen } from '@/components/chat/chat-screen';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ prompt?: string }>;
}

const uiMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'data']),
  content: z.string(),
  parts: z.array(z.any()),
  createdAt: z.union([z.date(), z.string(), z.number()]).optional().nullable(),
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { threadId } = await params;
  // Phase B — IDOR fix. Only fetch the thread if the current user owns it.
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { title: 'Chat' };
  const thread = await getThread(userId, threadId);
  return { title: thread?.title ?? 'Chat' };
}

export default async function ChatThreadPage({ params, searchParams }: PageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect('/login');

  const { threadId } = await params;

  const [thread, dbMessages, { threads: allThreads }] = await Promise.all([
    getThread(userId, threadId),
    listMessages(userId, threadId, 200),
    listThreads(userId, 50),
  ]);
  if (!thread) notFound();

  const initialMessages = dbMessages
    .map((m) => {
      const msg = {
        id: m.id,
        role: m.role,
        parts: Array.isArray(m.parts) ? m.parts : [],
        content: m.content ?? '',
        createdAt: m.createdAt,
      };
      const parsed = uiMessageSchema.safeParse(msg);
      return parsed.success ? (parsed.data as UIMessage) : null;
    })
    .filter((m): m is UIMessage => m !== null);

  const { prompt } = await searchParams;

  return (
    <ChatScreen
      threadId={thread.id}
      initialTitle={thread.title ?? 'New Chat'}
      initialMessages={initialMessages}
      initialThreads={allThreads.map((t) => ({
        id: t.id,
        title: t.title,
        pinnedSymbol: t.pinnedSymbol,
        updatedAt: t.updatedAt,
      }))}
      pinnedSymbol={thread.pinnedSymbol}
      autoSubmitPrompt={prompt ?? null}
    />
  );
}