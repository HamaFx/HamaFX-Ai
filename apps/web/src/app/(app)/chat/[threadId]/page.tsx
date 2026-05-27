// /chat/[threadId] — full-screen chat surface for a specific thread.
//
// Server component: validates the thread, hydrates the message history from
// Postgres, then hands off to the client `<ChatScreen>` for the streaming
// `useChat` experience.
//
// `?prompt=` is honoured for "Ask AI" deep-links from elsewhere in the
// app (article cards, calendar events). The chat surface auto-sends the
// prompt once it mounts.

import { getThread, listMessages, listThreads } from '@hamafx/ai';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChatScreen } from '@/components/chat/chat-screen';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ prompt?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { threadId } = await params;
  const t = await getThread(threadId);
  const display = t && t.titleSource === 'llm' && t.title ? t.title : 'Chat';
  return { title: display };
}

export default async function ChatThreadPage({ params, searchParams }: PageProps) {
  const { threadId } = await params;
  const { prompt } = await searchParams;

  const [thread, dbMessages, allThreads] = await Promise.all([
    getThread(threadId),
    listMessages(threadId, 200),
    listThreads(50),
  ]);
  if (!thread) notFound();

  const initialMessages = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant' | 'system',
    parts:
      Array.isArray(m.parts) && m.parts.length > 0
        ? (m.parts as { type: string }[])
        : ([{ type: 'text', text: m.content }] as { type: 'text'; text: string }[]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any[];

  const initialTitle =
    thread.titleSource === 'llm' && thread.title ? thread.title : 'New conversation';

  return (
    <ChatScreen
      threadId={thread.id}
      initialTitle={initialTitle}
      initialMessages={initialMessages}
      initialThreads={allThreads.map((t) => ({
        id: t.id,
        title: t.titleSource === 'llm' && t.title ? t.title : null,
        pinnedSymbol: t.pinnedSymbol,
        updatedAt: t.updatedAt,
      }))}
      pinnedSymbol={thread.pinnedSymbol}
      autoSubmitPrompt={prompt && prompt.trim().length > 0 ? prompt : null}
    />
  );
}
