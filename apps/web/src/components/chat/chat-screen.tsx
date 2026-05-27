'use client';

// Full-screen chat experience.
//
// Layout: fixed inset-0 with three rows:
//
//   ┌──────────────────────────────────┐
//   │ ChatTopBar    ☰ · title · + · ⋯ │  sticky, glass
//   ├──────────────────────────────────┤
//   │  message scroll area             │  flex-1, no-overscroll
//   │  (or empty state w/ prompts)     │
//   ├──────────────────────────────────┤
//   │ Composer                         │  sticky, glass
//   └──────────────────────────────────┘
//
// Stability tweaks vs. previous iteration:
//   - `paint-isolated` so the chat's full-bleed surface doesn't repaint
//     when sibling routes update (eliminates a flash visible during route
//     transitions on slow devices).
//   - `no-overscroll` on the scroll container so iOS Safari doesn't bounce
//     past the composer/top bar.
//   - Auto-scroll only fires when the user is within 240px of the bottom
//     and never scrolls during a streaming token tick (fixes "page
//     jumps while reading").
//   - Initial scroll uses an instant `scrollTop = scrollHeight`, never
//     `behavior: 'smooth'` — smooth-scroll on mount is the source of the
//     "drift" feeling.

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
  /** Optional prompt to auto-submit on mount. Used by deep-link
   *  affordances elsewhere in the app (Ask AI from a news article or
   *  calendar event). Sent at most once per thread. */
  autoSubmitPrompt?: string | null;
}

export function ChatScreen({
  threadId,
  initialTitle,
  initialMessages,
  initialThreads,
  pinnedSymbol,
  autoSubmitPrompt,
}: ChatScreenProps) {
  const lastUserTextRef = useRef<string>('');
  const autoSubmittedRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [title, setTitle] = useState(initialTitle);

  // One-shot model override — set right before calling regenerate() so the
  // body builder picks it up. Cleared after the request resolves.
  const modelOverrideRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages, id }) => {
          const override = modelOverrideRef.current;
          modelOverrideRef.current = null;
          return {
            body: {
              threadId,
              id,
              messages,
              ...(override ? { modelOverride: override } : {}),
            },
          };
        },
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

  // Last assistant message id — gets the Regenerate affordance.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m && m.role === 'assistant') return m.id;
    }
    return undefined;
  }, [messages]);

  // Auto-submit a prompt passed via ?prompt= (Ask AI deep links).
  // Fires once per thread, only on a fresh thread, never during streaming.
  useEffect(() => {
    if (!autoSubmitPrompt) return;
    if (autoSubmittedRef.current === threadId) return;
    if (messages.length > 0) return;
    if (isStreaming) return;
    autoSubmittedRef.current = threadId;
    lastUserTextRef.current = autoSubmitPrompt;
    void sendMessage({ text: autoSubmitPrompt });
  }, [autoSubmitPrompt, threadId, messages.length, isStreaming, sendMessage]);

  // After streaming completes, re-fetch thread to pick up the LLM-
  // generated title.
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
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, messages.length, threadId]);

  // Track whether the user has scrolled away from the bottom. The Latest
  // pill only renders when the gap is >200px so it doesn't flicker on
  // rounding errors.
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

  // Initial scroll-to-bottom. Instant, not smooth — smooth on mount is
  // what produced the "drift" effect on slow devices.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [threadId]);

  // Auto-scroll on new content, but only if the user is close to the
  // bottom. Distance < 240 means "user is following the conversation" —
  // we keep them at the bottom. Otherwise stay put so they can read
  // older messages without the page yanking them back.
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
    <div className="bg-bg paint-isolated fixed inset-0 z-50 flex flex-col">
      <ChatTopBar
        threadId={threadId}
        title={title}
        pinnedSymbol={pinnedSymbol}
        threads={initialThreads}
        isStreaming={isStreaming}
      />

      <div ref={scrollRef} className="scrollbar-hide no-overscroll relative flex-1 overflow-y-auto">
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
              onRegenerate={(opts) => {
                if (opts?.modelOverride) modelOverrideRef.current = opts.modelOverride;
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
          placeholder={pinnedSymbol ? `Ask about ${pinnedSymbol}…` : 'Ask about XAU, EUR, GBP…'}
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
            'inset 0 1px 0 0 oklch(100% 0 0 / 0.08), 0 0 40px -8px oklch(82% 0.14 85 / 0.35)',
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
        fetched on demand. The copilot will say so when something can&apos;t be checked.
      </p>
    </div>
  );
}
