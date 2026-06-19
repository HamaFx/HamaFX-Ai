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

import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ prompt?: string }>;
}

export default async function ChatLanding({ searchParams }: PageProps) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect('/login');

  const { prompt } = await searchParams;

  if (prompt && prompt.trim().length > 0) {
    const fresh = await createThread(userId);
    redirect(`/chat/${fresh.id}?prompt=${encodeURIComponent(prompt)}`);
  }

  const threads = await listThreads(userId, 1);
  const target = threads[0] ?? (await createThread(userId));
  redirect(`/chat/${target.id}`);
}