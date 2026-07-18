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

// Thread title fetching hook extracted from chat-screen.tsx (H2 audit fix).
//
// After streaming completes, re-fetches the thread to pick up the LLM-
// generated title. Caches per threadId to avoid redundant fetches.

import { useEffect, useRef, useState } from 'react';

interface UseThreadTitleOptions {
  threadId: string;
  initialTitle: string;
  status: string;
  messageCount: number;
}

interface UseThreadTitleResult {
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
}

export function useThreadTitle({
  threadId,
  initialTitle,
  status,
  messageCount,
}: UseThreadTitleOptions): UseThreadTitleResult {
  const [title, setTitle] = useState(initialTitle);
  const titleFetchedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (status !== 'ready' || messageCount < 2) return;
    if (titleFetchedRef.current[threadId]) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/chat/threads/${threadId}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          thread?: { title: string | null; titleSource: string | null };
        };
        const t = json.thread;
        if (t?.titleSource === 'llm' && t.title && !cancelled) {
          setTitle(t.title);
          titleFetchedRef.current[threadId] = true;
          if (typeof document !== 'undefined') {
            document.title = `${t.title} · HamaFX-Ai`;
          }
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, messageCount, threadId]);

  return { title, setTitle };
}
