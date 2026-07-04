'use client';

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

/**
 * <PinToChat> — chart toolbar button. Creates a fresh chat thread
 * with `pinnedSymbol = symbol` and deep-links to the new thread
 * with a pre-filled prompt so the agent answers immediately.
 *
 * Phase A — UX_UPGRADE_PLAN.md item 1.
 *
 * Flow:
 *   1. User taps "Pin to chat" on /chart/[symbol]
 *   2. POST /api/chat/threads { pinnedSymbol } → { thread: { id } }
 *   3. router.push(`/chat/[id]?prompt=Ask+about+<symbol>`)
 *   4. /chat/[id] page mounts ChatScreen, which auto-submits the
 *      prompt exactly once (autoSubmittedRef in chat-screen.tsx).
 */

import type { Symbol } from '@hamafx/shared';
import { IconMessageCircle } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Tooltip } from '@/components/ui/tooltip';
import { fetchCsrf } from '@/lib/csrf';

export interface PinToChatProps {
  symbol: Symbol;
  /** Optional override for the prompt text. Defaults to "Ask about <symbol>". */
  prompt?: string;
}

export function PinToChat({ symbol, prompt }: PinToChatProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onPin() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetchCsrf('/api/chat/threads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinnedSymbol: symbol }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { thread?: { id?: string } };
      const threadId = json.thread?.id;
      if (!threadId) throw new Error('server did not return a thread id');
      const promptText = prompt ?? `Ask about ${symbol}`;
      router.push(`/chat/${threadId}?prompt=${encodeURIComponent(promptText)}`);
    } catch (err) {
      toast.error('Could not start chat', {
        description: err instanceof Error ? err.message : 'unknown',
      });
      setPending(false);
    }
  }

  return (
    <Tooltip label={`Pin ${symbol} to a new chat`} side="bottom">
      <button
        type="button"
        onClick={() => void onPin()}
        disabled={pending}
        aria-label={`Pin ${symbol} to a new chat`}
        className="bg-bg-elev-1 border border-border text-fg-muted hover:text-fg hover:border-border focus-visible:ring-fg inline-flex size-11 items-center justify-center rounded-sm focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <IconMessageCircle className="size-4" strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}
