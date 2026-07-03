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
import type { Symbol } from '@hamafx/shared';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowDown, RotateCcw, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/lib/cn';
import { getCsrfToken } from '@/lib/csrf';
import { useConfirm } from '@/components/ui/confirm-drawer';

import { ChatTopBar, type ThreadSummary, type AnalysisMode } from './chat-top-bar';
import { Composer } from './composer';
import { MessageList } from './message-list';
import { QuickPrompts } from './quick-prompts';
import { AgentDeliberation } from './parts/agent-deliberation';
import { ThreadSummaryHeader } from './_components/thread-summary-header';

interface ChatScreenProps {
  threadId: string;
  initialTitle: string;
  initialMessages: UIMessage[];
  initialThreads: ThreadSummary[];
  pinnedSymbol: Symbol | null;
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
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('auto');
  const [agentProgress, setAgentProgress] = useState<{
    agents: Array<{ agentName: string; status: 'pending' | 'running' | 'done' | 'error'; opinion?: { agentName: string; bias: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string }; error?: string }>;
    mode: string;
  } | null>(null);

  // One-shot model override — set right before calling regenerate() so the
  // body builder picks it up. Cleared after the request resolves.
  const modelOverrideRef = useRef<string | null>(null);

  const [showScrollFab, setShowScrollFab] = useState(false);
  const [dismissedError, setDismissedError] = useState(false);
  const [isMultiAgentStreaming, setIsMultiAgentStreaming] = useState(false);
    const [confirmEl, confirm] = useConfirm();
  const titleFetchedRef = useRef<Record<string, boolean>>({});

  // Phase 1.5 — thread summary header state (effect wired after useChat).
  const [summary, setSummary] = useState<{ synopsis: string; insights: Array<{ text: string; symbol?: string | null }> } | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages, id }) => {
          const override = modelOverrideRef.current;
          const csrf = getCsrfToken();
          const prefsJson = typeof window !== 'undefined' ? window.localStorage.getItem('hamafx:ai-prefs') : null;
          
          const reqBody = {
            modelOverride: override ?? undefined,
            analysisMode,
            threadId,
            id,
            messages,
          };

          const headers: Record<string, string> = {};
          if (csrf) headers['X-CSRF-Token'] = csrf;
          if (prefsJson) headers['X-AI-Prefs'] = prefsJson;

          return Object.keys(headers).length > 0
            ? { headers, body: reqBody }
            : { body: reqBody };
        },
      }),
    [threadId, analysisMode],
  );

  const { messages, setMessages, sendMessage, regenerate, stop, status, error } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
  });

  // Phase 1.5 — fetch thread summary once the thread grows past 20 messages.
  useEffect(() => {
    if (messages.length > 20 && !summary) {
      fetch(`/api/chat/threads/${threadId}/summary`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.synopsis === 'string') setSummary(data);
        })
        .catch(() => {});
    }
  }, [messages.length, threadId, summary]);

  // ── Multi-Agent SSE handling ──
  // When analysisMode is not 'single', the /api/chat endpoint returns a
  // custom SSE stream with progress events + final text. We intercept the
  // fetch to parse these events and update the UI accordingly.
  const multiAgentFetchRef = useRef<AbortController | null>(null);

  const sendMultiAgentMessage = useCallback(async (text: string) => {
    lastUserTextRef.current = text;
    setAgentProgress(null);

    // Add user message to the list immediately
    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text }],
    } as unknown as UIMessage;
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg = {
      id: assistantMsgId,
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: '' }],
    } as unknown as UIMessage;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsMultiAgentStreaming(true);

    const controller = new AbortController();
    multiAgentFetchRef.current = controller;

    try {
      const csrf = getCsrfToken();
      const prefsJson = typeof window !== 'undefined' ? window.localStorage.getItem('hamafx:ai-prefs') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrf) headers['X-CSRF-Token'] = csrf;
      if (prefsJson) headers['X-AI-Prefs'] = prefsJson;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          threadId,
          analysisMode,
          messages: [...messages, userMsg],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error?.message ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      let finalText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'data-agent-progress') {
              setAgentProgress(parsed.data);
            } else if (parsed.type === 'text') {
              finalText += parsed.text;
              // Update the assistant message content progressively
              setMessages((prev) => prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, parts: [{ type: 'text' as const, text: finalText }] } as UIMessage
                  : m,
              ));
            } else if (parsed.type === 'metadata') {
              // Metadata received — opinions, cost, etc.
              // Could store for later display
            } else if (parsed.type === 'error') {
              throw new Error(parsed.error);
            }
          } catch { /* ignore parse errors for non-JSON lines */ }
        }
      }

      setAgentProgress(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsgId
          ? { ...m, parts: [{ type: 'text' as const, text: `⚠️ Error: ${errMsg}` }] } as UIMessage
          : m,
      ));
      setAgentProgress(null);
    } finally {
      multiAgentFetchRef.current = null;
      setIsMultiAgentStreaming(false);
    }
  }, [analysisMode, messages, setMessages, threadId]);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  }, []);

  const handleRegenerate = useCallback((opts?: { modelOverride?: string }) => {
    if (opts?.modelOverride) modelOverrideRef.current = opts.modelOverride;
    if (analysisMode !== 'single') {
      // For multi-agent regenerate, re-send the last user message
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUser) {
        // Remove the last assistant message
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === lastUser.id);
          return prev.slice(0, idx + 1);
        });
        void sendMultiAgentMessage(
          (lastUser as unknown as { content?: string }).content
          || (Array.isArray(lastUser.parts) ? lastUser.parts.filter((p) => (p as { type?: string }).type === 'text').map((p) => (p as { text: string }).text).join('') : '')
          || ''
        );
      }
      return;
    }
    void regenerate();
  }, [regenerate, analysisMode, messages, setMessages, sendMultiAgentMessage]);

  const handleEdit = useCallback(async (messageId: string, newText: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const isLastMessage = idx === messages.length - 1;
    if (!isLastMessage) {
      const ok = await confirm({
        title: 'Edit earlier message?',
        description: 'Editing this message will create a new thread branch. The current thread will be preserved.',
        confirmLabel: 'Create branch',
        tone: 'default',
      });
      if (!ok) return;
      try {
        const csrf = getCsrfToken();
        const res = await fetch('/api/chat/threads/fork', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrf ?? '',
          },
          body: JSON.stringify({
            sourceThreadId: threadId,
            atMessageId: messageId,
            newText,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            body?.error?.message ?? `HTTP ${res.status}`,
          );
        }
        const { threadId: newThreadId } = (await res.json()) as {
          threadId: string;
        };
        toast.success('Forked into a new thread');
        router.push(`/chat/${newThreadId}`);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Could not fork thread',
        );
      }
      return;
    }
    const sliced = messages.slice(0, idx);
    setMessages(sliced);
    if (analysisMode !== 'single') {
      void sendMultiAgentMessage(newText);
    } else {
      void sendMessage({ text: newText });
    }
  }, [messages, threadId, router, sendMessage, setMessages, analysisMode, sendMultiAgentMessage, confirm]);

  const isStreaming = useMemo(() => {
    if (status === 'submitted' || status === 'streaming') return true;
    if (isMultiAgentStreaming) return true;
    return false;
  }, [status, isMultiAgentStreaming]);
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
    if (analysisMode !== 'single') {
      void sendMultiAgentMessage(autoSubmitPrompt);
    } else {
      void sendMessage({ text: autoSubmitPrompt });
    }
  }, [autoSubmitPrompt, threadId, messages.length, isStreaming, sendMessage, analysisMode, sendMultiAgentMessage]);

  // Clear model override only after successful stream ready
  useEffect(() => {
    if (status === 'ready' && !error) {
      modelOverrideRef.current = null;
    }
  }, [status, error]);

  // Reset error dismissal when new stream starts
  useEffect(() => {
    if (isStreaming) {
      setDismissedError(false);
    }
  }, [isStreaming]);

  // Track scroll position to show/hide the "Scroll to Bottom" FAB
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollFab(dist > 240);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // After streaming completes, re-fetch thread to pick up the LLM-
  // generated title.
  useEffect(() => {
    if (status !== 'ready' || messages.length < 2) return;
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
  }, [status, messages.length, threadId]);

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
    <div className="bg-black paint-isolated fixed inset-0 z-50 flex flex-col xl:grid xl:grid-cols-12 xl:h-screen xl:w-full xl:overflow-hidden">
      <ChatTopBar
        threadId={threadId}
        title={title}
        pinnedSymbol={pinnedSymbol}
        threads={initialThreads}
        isStreaming={isStreaming}
        analysisMode={analysisMode}
        onAnalysisModeChange={setAnalysisMode}
      />

      <div ref={scrollRef} className="scrollbar-hide no-overscroll relative flex-1 overflow-y-auto xl:col-span-6 xl:h-full xl:overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4">
          {summary ? (
            <div className="px-3 pt-2">
              <ThreadSummaryHeader
                synopsis={summary.synopsis}
                insights={summary.insights}
                onDismiss={() => setSummary(null)}
              />
            </div>
          ) : null}
          {agentProgress && (
            <div className="px-3 py-2">
              <AgentDeliberation agents={agentProgress.agents} mode={agentProgress.mode} />
            </div>
          )}
          {isEmpty ? (
            <EmptyChatState
              pinnedSymbol={pinnedSymbol}
              {...(isStreaming ? { disabled: true } : {})}
              onSelect={(text) => {
                lastUserTextRef.current = text;
                if (analysisMode !== 'single') {
                  void sendMultiAgentMessage(text);
                } else {
                  void sendMessage({ text });
                }
              }}
            />
          ) : (
            <MessageList
              messages={messages}
              {...(isStreaming ? { isStreaming } : {})}
              showTypingIndicator={status === 'submitted'}
              scrollContainerRef={scrollRef}
              {...(lastAssistantId ? { lastAssistantId } : {})}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
              onEdit={handleEdit}
            />
          )}
          <AnimatePresence>
            {error && !dismissedError ? (
              <m.div
                key="chat-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                role="alert"
                className={cn(
                  'bg-red-500/10 text-red-500 border border-red-500/30 mx-3 mb-2 flex items-center justify-between gap-2 rounded-sm p-3 text-xs',
                )}
              >
                <span className="line-clamp-2 flex-1">{error.message}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (lastUserTextRef.current) {
                        if (analysisMode !== 'single') {
                          void sendMultiAgentMessage(lastUserTextRef.current);
                        } else {
                          void sendMessage({ text: lastUserTextRef.current });
                        }
                      }
                    }}
                    aria-label="Retry"
                    className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 inline-flex items-center gap-1 rounded-sm px-3 py-1.5 text-body-sm font-medium"
                  >
                    <RotateCcw className="size-3.5" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedError(true)}
                    aria-label="Dismiss error"
                    className="hover:bg-red-500/10 text-red-500/80 hover:text-red-500 inline-flex size-7 items-center justify-center rounded-sm transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showScrollFab && (
            <m.button
              key="scroll-fab"
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={scrollToBottom}
              aria-label="Scroll to latest"
              className="scroll-fab surface-elevated text-fg fixed left-1/2 z-30 inline-flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-sm px-4 text-body-sm font-medium transition-all"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
            >
              <ArrowDown className="size-3.5" />
              Latest
            </m.button>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-2xl">
          <Composer
            onSubmit={(text, images) => {
              lastUserTextRef.current = text;
              if (analysisMode !== 'single' && images.length > 0) {
                toast('Image analysis runs in single-agent mode. Switching to single-agent for this turn.');
              } else if (analysisMode !== 'single') {
                void sendMultiAgentMessage(text);
                return;
              }
              if (images.length === 0) {
                void sendMessage({ text });
                return;
              }
              void sendMessage({
                text,
                files: images.map((img) => ({
                  type: 'file' as const,
                  mediaType: img.mediaType,
                  url: img.url,
                  filename: img.name,
                })),
              });
            }}
          onStop={() => {
            if (multiAgentFetchRef.current) {
              multiAgentFetchRef.current.abort();
              multiAgentFetchRef.current = null;
              setAgentProgress(null);
            }
            stop();
          }}
          isStreaming={isStreaming}
          disabled={isStreaming}
          placeholder={pinnedSymbol ? `Ask about ${pinnedSymbol}…` : 'Ask about XAU, EUR, GBP…'}
        />
      </div>

      {confirmEl}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface EmptyChatStateProps {
  pinnedSymbol: Symbol | null;
  disabled?: boolean;
  onSelect: (text: string) => void;
}

function EmptyChatState({ pinnedSymbol, disabled, onSelect }: EmptyChatStateProps) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="text-fg-muted inline-flex size-16 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900"
      >
        <Sparkles className="size-8" strokeWidth={1.75} />
      </span>
      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-fg text-xl font-bold tracking-tight">How can I help?</h2>
        <p className="text-fg-muted text-sm leading-[1.4]">
          {pinnedSymbol
            ? `Ask about ${pinnedSymbol} bias, structure, news, or set an alert.`
            : 'Ask about gold, EUR, GBP — bias, structure, news, or set an alert.'}
        </p>
      </div>

      <div className="w-full max-w-md">
        <QuickPrompts
          onSelect={onSelect}
          {...(pinnedSymbol !== undefined ? { pinnedSymbol } : {})}
          {...(disabled ? { disabled: true } : {})}
        />
      </div>

      <p className="text-fg-subtle max-w-md text-body-sm leading-[1.4]">
        Numbers come from live tools — prices, candles, news, and the calendar are
        fetched on demand. The copilot will say so when something can&apos;t be checked.
      </p>
    </div>
  );
}
