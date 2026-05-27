// /chat — landing route.
//
// Behaviour:
//   - With ?prompt=… → always create a fresh thread and forward the
//     prompt as a query param so the chat surface auto-sends it once
//     the page mounts. Used by "Ask AI" affordances elsewhere
//     (article cards, calendar events) to drop the user straight into
//     a conversation about the thing they tapped.
//   - Otherwise → redirect to the most recently used thread, or create
//     a fresh one if none exist.

import { createThread, listThreads } from '@hamafx/ai';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ prompt?: string }>;
}

export default async function ChatLanding({ searchParams }: PageProps) {
  const { prompt } = await searchParams;

  if (prompt && prompt.trim().length > 0) {
    const fresh = await createThread();
    redirect(`/chat/${fresh.id}?prompt=${encodeURIComponent(prompt)}`);
  }

  const threads = await listThreads(1);
  const target = threads[0] ?? (await createThread());
  redirect(`/chat/${target.id}`);
}
