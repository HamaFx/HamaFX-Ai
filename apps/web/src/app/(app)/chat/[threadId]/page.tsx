import type { UIMessage } from 'ai';
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

  const [thread, dbMessages, allThreads] = await Promise.all([
    getThread(userId, threadId),
    listMessages(userId, threadId, 200),
    listThreads(userId, 50),
  ]);
  if (!thread) notFound();

  const initialMessages = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant' | 'system',
    parts: Array.isArray(m.parts) ? m.parts : [],
    content: m.content ?? '',
    createdAt: m.createdAt,
  }));

  const { prompt } = await searchParams;

  return (
    <ChatScreen
      threadId={thread.id}
      initialTitle={thread.title ?? 'New Chat'}
      initialMessages={initialMessages as UIMessage[]}
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