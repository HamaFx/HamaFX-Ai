// /chat — landing page.
// Behaviour:
//   - If there are existing threads, redirect to the most recently used one.
//   - Otherwise create a fresh thread and redirect to it.
//
// We do this at the route level (not inside the chat surface) so the URL is
// always canonical for a thread; refreshing /chat keeps you on the same
// thread between visits.

import { createThread, listThreads } from '@hamafx/ai';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ChatLanding() {
  const threads = await listThreads(1);
  const target = threads[0] ?? (await createThread());
  redirect(`/chat/${target.id}`);
}
