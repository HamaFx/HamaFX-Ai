'use client';

// Full-screen chat experience.
//
// Layout: fixed inset-0 with three rows:
//
//   ┌──────────────────────────────────┐
//   │ ChatTopBar                       │ ← merged top bar (sticky, glass)
//   │   ☰  · title · new · menu        │
//   ├──────────────────────────────────┤
//   │                                  │
//   │  message scroll area             │ ← flex-1, scrollable
//   │   (or empty state w/ prompts)    │
//   │  + scroll-to-bottom pill         │
//   │                                  │
//   ├──────────────────────────────────┤
//   │ Composer                         │ ← sticky, glass, full width
//   └──────────────────────────────────┘
//
// New in this iteration:
//   - Empty state lives inside the scroll body and embeds quick-prompts so
//     there's one inviting surface, not two competing panels.
//   - Composer can now stop streaming (wired to AI SDK's `stop()`).
//   - Last assistant message gets a Regenerate affordance (`regenerate()`).
//   - Initial mount auto-scrolls to bottom (no flash of older content).

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowDown, RotateCcw, Sparkles } from 'lucide-react';
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

  const { messages, sendMessage, regenerate, stop, status, error } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
  });

  const isStreaming = status === 'submitted' || status === 'streaming';
  const isEmpty = messages.length === 0;

  // Last assistant message id — used to attach the Regenerate button.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m && m.role === 'assistant') return m.id;
    }
    return undefined;
  }, [messages]);

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

  // Track if user has scrolled away from the bottom — show the scroll-to-
  // bottom button.
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

  // Initial scroll to bottom on mount (so we open at the latest message,
  // not the first one) + auto-scroll on new messages if user is near
  // bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Initial pin to bottom — rAF lets the message list paint first.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [threadId]);

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
          {isEmpty ? (
            <EmptyChatState
              pinnedSymbol={pinnedSymbol}
              {...(isStreaming ? { disabled: true } : {})}
              onSelect={(text) => {
                lastUserTextRef.current = text;
                void sendMessage({ text });
              }}
            />
          ) : (
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              {...(lastAssistantId ? { lastAssistantId } : {})}
              onCopy={(text) => {
                void navigator.clipboard.writeText(text);
                toast.success('Copied');
              }}
              onRegenerate={() => {
                void regenerate();
              }}
            />
          )}
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
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
          >
            <ArrowDown className="size-3.5" />
            Latest
          </button>
        ) : null}
      </div>

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
          onStop={() => stop()}
          isStreaming={isStreaming}
          disabled={false}
          placeholder={
            pinnedSymbol ? `Ask about ${pinnedSymbol}…` : 'Ask about XAU, EUR, GBP…'
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface EmptyChatStateProps {
  pinnedSymbol: 'XAUUSD' | 'EURUSD' | 'GBPUSD' | null;
  disabled?: boolean;
  onSelect: (text: string) => void;
}

function EmptyChatState({ pinnedSymbol, disabled, onSelect }: EmptyChatStateProps) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="text-brand inline-flex size-20 items-center justify-center rounded-3xl"
        style={{
          backgroundImage: 'var(--gradient-brand-soft)',
          boxShadow:
            'inset 0 1px 0 0 oklch(100% 0 0 / 0.1), 0 0 40px -8px oklch(78% 0.16 78 / 0.4)',
        }}
      >
        <Sparkles className="size-9" strokeWidth={1.75} />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-fg text-2xl font-bold tracking-tight">How can I help?</h2>
        <p className="text-fg-muted text-sm leading-relaxed">
          {pinnedSymbol
            ? `Ask about ${pinnedSymbol} bias, structure, news, or set an alert.`
            : 'Ask about gold, EUR, GBP — bias, structure, news, or set an alert.'}
        </p>
      </div>

      <div className="w-full max-w-md">
        <QuickPrompts onSelect={onSelect} {...(disabled ? { disabled: true } : {})} />
      </div>

      <p className="text-fg-subtle max-w-md text-[11px] leading-relaxed">
        Numbers come from live tools — prices, candles, news, and the calendar are
        fetched on demand. The copilot will say so when something can't be checked.
      </p>
    </div>
  );
}
