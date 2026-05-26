// /chat/[threadId] — chat surface for a specific thread.
//
// Server component: validates the thread, hydrates the message history from
// Postgres, then hands off to the client `<ChatSurface>` for the streaming
// `useChat` experience.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getThread, listMessages } from '@hamafx/ai';

import { PageHeader } from '@/components/layout/page-header';
import { ChatSurface } from '@/components/chat/chat-surface';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ threadId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { threadId } = await params;
  const t = await getThread(threadId);
  return { title: t?.title ?? 'Chat' };
}

export default async function ChatThreadPage({ params }: PageProps) {
  const { threadId } = await params;

  const [thread, dbMessages] = await Promise.all([
    getThread(threadId),
    listMessages(threadId, 200),
  ]);
  if (!thread) notFound();

  // Convert DB rows to UIMessage shape. We stored `parts` as JSONB so the
  // shape is already SDK-compatible; if a row is empty (legacy) we fall back
  // to a single text part synthesised from `content`.
  const initialMessages = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant' | 'system',
    parts: Array.isArray(m.parts) && m.parts.length > 0
      ? (m.parts as { type: string }[])
      : ([{ type: 'text', text: m.content }] as { type: 'text'; text: string }[]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any[];

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title={thread.title ?? 'New conversation'} description="HamaFX-Ai copilot" />
      <ChatSurface threadId={thread.id} initialMessages={initialMessages} />
    </div>
  );
}
