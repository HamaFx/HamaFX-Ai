// SPDX-License-Identifier: Apache-2.0

// /chat — landing route.
//
// Behaviour:
//   - With ?prompt=… → always create a fresh thread and forward the
//     prompt as a query param so the chat surface auto-sends it once
//     the page mounts. Used by "Ask AI" affordances elsewhere
//     (article cards, calendar events) to drop the user straight into
//     a conversation about the thing they tapped.
//   - With ?prompt= AND no AI provider configured → still create a
//     fresh thread but redirect to /settings/api-keys?from=chat&prompt=…
//     so the user can configure a key, then the prompt is preserved
//     (api-keys banner reads it and offers "Continue to chat").
//   - Otherwise → check that the user has at least one AI provider
//     configured (Phase A item 4). If not, redirect to
//     /settings/api-keys?from=chat. Otherwise redirect to the most
//     recently used thread, or create a fresh one if none exist.

import { configuredProviders, decryptByok } from '@hamafx/shared/encryption';
import { createThread, listThreads } from '@hamafx/ai';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getUserApiKeys } from '@hamafx/db';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ prompt?: string }>;
}

export default async function ChatLanding({ searchParams }: PageProps) {
  const session = await auth();
  const userId =
    process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV !== 'production'
      ? '__system__'
      : session?.user?.id;
  if (!userId) redirect('/login');

  const { prompt } = await searchParams;

  // Phase A item 4 — auto-redirect to api-keys when the user has no
  // configured provider. We check aiApiKeys on the user's settings
  // row, decrypt, and ask `configuredProviders()` whether any key is
  // present. A single DB round-trip; the helper is pure.
  // Skip API-keys check in legacy mode (__system__ has no keys configured)
  if (process.env.AUTH_MODE !== 'legacy' || process.env.NODE_ENV === 'production') {
    const encryptedKeys = await getUserApiKeys(userId);
    const providers = configuredProviders(decryptByok(encryptedKeys));
    if (providers.length === 0) {
      const params = new URLSearchParams({ from: 'chat' });
      if (prompt && prompt.trim().length > 0) params.set('prompt', prompt);
      redirect(`/settings/api-keys?${params.toString()}`);
    }
  }

  if (prompt && prompt.trim().length > 0) {
    const fresh = await createThread(userId);
    redirect(`/chat/${fresh.id}?prompt=${encodeURIComponent(prompt)}`);
  }

  const { threads } = await listThreads(userId, 1);
  const target = threads[0] ?? (await createThread(userId));
  redirect(`/chat/${target.id}`);
}