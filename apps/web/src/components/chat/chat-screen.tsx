'use client';

// Full-screen chat experience.
//
// Layout: fixed inset-0 with three rows:
//
//   ┌──────────────────────────────────┐
//   │ ChatTopBar                       │ ← merged top bar (sticky, glass)
//   │   ← back · title · thread menu   │   replaces both TopBar + PageHeader
//   ├──────────────────────────────────┤
//   │                                  │
//   │  message scroll area             │ ← flex-1, scrollable
//   │  + scroll-to-bottom FAB          │
//   │                                  │
//   ├──────────────────────────────────┤
//   │ Composer                         │ ← sticky, glass, full width
//   │   pinned symbol · input · send   │
//   └──────────────────────────────────┘
//
// Z-index: 50 to cover both the (app) layout's TopBar and BottomNav.
// Safe-area: handled via env(safe-area-inset-top/bottom) on top + bottom rows.
//
// We do NOT mount a second AmbientBackground here — the (app) layout's
// fixed `-z-10` ambient still shows through the chat surface (chat is a
// stacking context but the ambient sits behind it on the body). Doubling
// up cost a measurable iOS Safari paint when both `feTurbulence` filters
// re-rendered on every scroll.

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowDown, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';

import { ChatTopBar, type ThreadSummary } from './chat-top-bar';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { QuickPrompts } from './quick-prompts';

interface ChatScreenProps {
  threadId: string;
  initialTitle: string;
  initialMessages: UIMessage[];
  initialThreads: ThreadSummary[];
  pinnedSymbol: 'XAUUSD' | 'EURUSD' | 'GBPUSD' | null;
}

export function ChatScreen({
  threadId,
  initialTitle,
  initialMessages,
  initialThreads,
  pinnedSymbol,
}: ChatScreenProps) {
  const lastUserTextRef = useRef<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [title, setTitle] = useState(initialTitle);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages, id }) => ({
          body: { threadId, id, messages },
        }),
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
  });

  const isStreaming = status === 'submitted' || status === 'streaming';

  // After streaming completes, re-fetch thread to pick up the LLM-generated title.
  useEffect(() => {
    if (status !== 'ready' || messages.length < 2) return;
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
          // Update the document title too.
          if (typeof document !== 'undefined') {
            document.title = `${t.title} · HamaFX-Ai`;
          }
        }
      } catch {
        /* silent — stay on the placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, messages.length, threadId]);

  // Track if user has scrolled away from the bottom — show the scroll-to-bottom button.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function check() {
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollDown(distanceFromBottom > 200);
    }
    check();
    el.addEventListener('scroll', check, { passive: true });
    return () => el.removeEventListener('scroll', check);
  }, []);

  // When new messages arrive, auto-scroll to bottom only if user was already near bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 240) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages, isStreaming]);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }

  return (
    <div className="bg-bg fixed inset-0 z-50 flex flex-col">
      <ChatTopBar
        threadId={threadId}
        title={title}
        pinnedSymbol={pinnedSymbol}
        threads={initialThreads}
        isStreaming={isStreaming}
      />

      <div ref={scrollRef} className="scrollbar-hide relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl">
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            onCopy={(text) => {
              void navigator.clipboard.writeText(text);
              toast.success('Copied');
            }}
          />
          {error ? (
            <div
              role="alert"
              className={cn(
                'bg-bear/10 text-bear ring-bear/30 mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl p-3 text-xs ring-1 backdrop-blur',
              )}
            >
              <span className="line-clamp-2 flex-1">{error.message}</span>
              <button
                type="button"
                onClick={() => {
                  if (lastUserTextRef.current) {
                    void sendMessage({ text: lastUserTextRef.current });
                  }
                }}
                aria-label="Retry"
                className="bg-bear/20 hover:bg-bear/30 ring-bear/30 inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium ring-1"
              >
                <RotateCcw className="size-3.5" /> Retry
              </button>
            </div>
          ) : null}
        </div>

        {/* Scroll-to-bottom pill — appears when scrolled up */}
        {showScrollDown ? (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Scroll to latest"
            className="glass-strong text-fg fixed left-1/2 z-30 inline-flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-full px-4 text-xs font-medium"
            style={{ bottom: 'var(--toast-bottom)' }}
          >
            <ArrowDown className="size-3.5" />
            Latest
          </button>
        ) : null}
      </div>

      {messages.length <= 1 && !isStreaming ? (
        <div className="mx-auto w-full max-w-2xl">
          <QuickPrompts
            onSelect={(text) => {
              lastUserTextRef.current = text;
              void sendMessage({ text });
            }}
            disabled={isStreaming}
          />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-2xl">
        <Composer
          onSubmit={(text, images) => {
            lastUserTextRef.current = text;
            if (images.length === 0) {
              void sendMessage({ text });
              return;
            }
            void sendMessage({
              text,
              files: images.map((img) => ({
                type: 'file' as const,
                mediaType: img.mediaType,
                url: img.dataUrl,
                filename: img.name,
              })),
            });
          }}
          disabled={isStreaming}
          placeholder={
            pinnedSymbol ? `Ask about ${pinnedSymbol}…` : 'Ask about XAU, EUR, GBP…'
          }
        />
      </div>
    </div>
  );
}
