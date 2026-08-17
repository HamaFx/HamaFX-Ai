'use client';

/**
 * Copyright 2026 Kestrel
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
//   │ ChatTopBar    ☰ · title · + · ⋯ │  sticky
//   ├──────────────────────────────────┤
//   │  message scroll area             │  flex-1, no-overscroll
//   │  (or empty state w/ prompts)     │
//   ├──────────────────────────────────┤
//   │ Composer                         │  sticky
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
import { KestrelBrand } from '@/components/brand/kestrel-brand';
import type { Symbol } from '@kestrel/shared';
import type { UIMessage } from 'ai';
import {IconArrowDown, IconArrowBackUp, IconX} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/lib/cn';
import { getCsrfToken } from '@/lib/csrf';
import { apiFetch, apiMutate } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useThreadTitle } from '@/hooks/use-thread-title';
import { createKestrelChatTransport, type AgentProgress } from '@/lib/chat-transport';

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
  /** Default analysis mode loaded from the user's server-side settings. */
  initialAnalysisMode?: AnalysisMode;
  /** Saved chat model in `provider:model` format, or null for resolver default. */
  initialChatModel?: string | null;
  /** Whether the completed committee opinions should remain visible. */
  initialShowAgentOpinions?: boolean;
  /** Server-side AI custom instructions. Using the DB value as the
   *  source of truth prevents cross-device drift from localStorage. */
  initialCustomInstructions?: string | null;
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
  initialAnalysisMode = 'auto',
  initialChatModel = null,
  initialShowAgentOpinions = true,
  initialCustomInstructions,
  autoSubmitPrompt,
}: ChatScreenProps) {
  const lastUserTextRef = useRef<string>('');
  const autoSubmittedRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(initialAnalysisMode);
  // Keep the latest selector value available synchronously to the transport.
  // React state updates are asynchronous, so a user can select Full and press
  // Enter before a re-render updates the callback closure.
  const analysisModeRef = useRef<AnalysisMode>(initialAnalysisMode);
  const [showAgentOpinions] = useState(initialShowAgentOpinions);
  const [chatModel, setChatModel] = useState<string | null>(initialChatModel);
  const chatModelRef = useRef<string | null>(initialChatModel);
  const [modelSelectionPending, setModelSelectionPending] = useState(false);

  // One-shot model override.
  const modelOverrideRef = useRef<string | null>(null);

  const [dismissedError, setDismissedError] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null);
  const [confirmEl, confirm] = useConfirm();

  // P3: DB is the source of truth for AI custom instructions so that
  // changes made on another device are reflected immediately on the
  // next page load. The prop comes from the server component and is
  // stable for the lifetime of this client view.
  const customInstructions = initialCustomInstructions ?? '';

  // Phase 1.5 — thread summary header state.
  const [summary, setSummary] = useState<{ synopsis: string; insights: Array<{ text: string; symbol?: string | null }> } | null>(null);

  const onAgentProgressRef = useRef<(progress: AgentProgress | null) => void>(() => {});
  const singleTurnOverrideRef = useRef<'single' | null>(null);

  const transport = useMemo(
    () =>
      createKestrelChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages, id, body }) => {
          const override = modelOverrideRef.current;
          const singleTurnOverride = singleTurnOverrideRef.current;
          // Consume the image-mode override inside the transport callback,
          // not immediately after sendMessage(). AI SDK transport preparation
          // may be deferred, so clearing it in the composer can race this read.
          singleTurnOverrideRef.current = null;
          const csrf = getCsrfToken();
          const prefs = { customInstructions };
          const prefsJson = customInstructions ? JSON.stringify(prefs) : null;

          const reqBody = {
            ...body,
            modelOverride: override ?? undefined,
            // Request-critical fields must be written after `body`; callers
            // may pass a stale body snapshot through the AI SDK transport.
            analysisMode: singleTurnOverride ?? analysisModeRef.current,
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
        onAgentProgress: (p) => onAgentProgressRef.current(p),
      }),
    [threadId, customInstructions],
  );

  useEffect(() => {
    onAgentProgressRef.current = (p) => setAgentProgress(p);
  });

  useEffect(() => {
    if (analysisMode === 'single' || !showAgentOpinions) {
      setAgentProgress(null);
    }
  }, [analysisMode, showAgentOpinions]);

  const { messages, setMessages, sendMessage, regenerate, stop, status, error } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
  });

  // H2: Thread title fetching via dedicated hook.
  const { title } = useThreadTitle({
    threadId,
    initialTitle,
    status,
    messageCount: messages.length,
  });

  // Ref to hold the latest messages array — avoids stale closure.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Phase 1.5 — fetch thread summary once the thread grows past 20 messages.
  useEffect(() => {
    if (messages.length > 20 && !summary) {
      // STAB-15: Use an AbortController to cancel in-flight fetches
      // when the component unmounts or threadId changes, preventing
      // stale responses from overwriting the current thread's summary.
      const ac = new AbortController();
      apiFetch<{ synopsis: string; insights: Array<{ text: string; symbol?: string | null }> }>(
        `/api/chat/threads/${threadId}/summary`,
        { signal: ac.signal },
      )
        .then((data) => {
          if (data && typeof data.synopsis === 'string') setSummary(data);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
        });
      return () => ac.abort();
    }
  }, [messages.length, threadId, summary]);

  // H2: Auto-scroll via dedicated hook (isStreaming defined before use).
  const isStreaming = useMemo(() => status === 'submitted' || status === 'streaming', [status]);

  const setScrollContainer = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element;
    setScrollElement(element);
  }, []);

  const { showScrollFab, scrollToBottom } = useAutoScroll({
    scrollRef,
    scrollElement,
    dependency: messages,
    resetKey: threadId,
    isStreaming,
  });

  // Auto-submit a prompt passed via ?prompt= (Ask AI deep links).
  useEffect(() => {
    if (!autoSubmitPrompt) return;
    if (autoSubmittedRef.current === threadId) return;
    if (messages.length > 0) return;
    if (isStreaming) return;
    autoSubmittedRef.current = threadId;
    lastUserTextRef.current = autoSubmitPrompt;
    void sendMessage({ text: autoSubmitPrompt });
  }, [autoSubmitPrompt, threadId, messages.length, isStreaming, sendMessage]);

  // Clear one-shot controls after a failed/settled turn as a safety net.
  // The transport normally consumes the image override before the request
  // starts; this also prevents a failed preparation from leaking it into the
  // next turn.
  useEffect(() => {
    if (status === 'ready' || (error && status === 'error')) {
      modelOverrideRef.current = null;
      singleTurnOverrideRef.current = null;
    }
  }, [status, error]);

  // Reset error dismissal when new stream starts.
  useEffect(() => {
    if (isStreaming) {
      setDismissedError(false);
    }
  }, [isStreaming]);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  }, []);

  const handleRegenerate = useCallback((opts?: { modelOverride?: string }) => {
    if (opts?.modelOverride) modelOverrideRef.current = opts.modelOverride;
    void regenerate();
  }, [regenerate]);

  const handleChatModelChange = useCallback((nextModel: string) => {
    const separator = nextModel.indexOf(':');
    if (separator <= 0 || separator === nextModel.length - 1) {
      toast.error('Invalid model selection', {
        description: 'Please choose a model from the catalog.',
      });
      return;
    }

    const previousModel = chatModelRef.current;
    chatModelRef.current = nextModel;
    setChatModel(nextModel);
    setModelSelectionPending(true);

    void apiMutate<{ ok: true; chatModel: string }>('/api/settings/chat-model', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providerId: nextModel.slice(0, separator),
        modelId: nextModel.slice(separator + 1),
      }),
    })
      .then((data) => {
        const savedModel = data.chatModel || nextModel;
        chatModelRef.current = savedModel;
        setChatModel(savedModel);
        toast.success('Chat model updated');
      })
      .catch((err) => {
        chatModelRef.current = previousModel;
        setChatModel(previousModel);
        toast.error('Could not save chat model', {
          description: err instanceof Error ? err.message : 'Please try again.',
        });
      })
      .finally(() => setModelSelectionPending(false));
  }, []);

  const handleAnalysisModeChange = useCallback((nextMode: AnalysisMode) => {
    const previousMode = analysisModeRef.current;
    // Update the ref before state so an immediately-submitted turn uses the
    // mode the user just selected, even before React re-renders.
    analysisModeRef.current = nextMode;
    setAnalysisMode(nextMode);
    void apiMutate(`/api/chat/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ analysisMode: nextMode }),
    }).catch((err) => {
      analysisModeRef.current = previousMode;
      setAnalysisMode(previousMode);
      toast.error('Could not save analysis mode', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    });
  }, [threadId]);

  const handleEdit = useCallback(async (messageId: string, newText: string) => {
    // Read messages from the ref so this callback is stable across stream tokens
    // (avoids recreating it on every token, which would defeat MessageList's memo).
    const cur = messagesRef.current;
    const idx = cur.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const isLastMessage = idx === cur.length - 1;
    if (!isLastMessage) {
      const ok = await confirm({
        title: 'Edit earlier message?',
        description: 'Editing this message will create a new thread branch. The current thread will be preserved.',
        confirmLabel: 'Create branch',
        tone: 'default',
      });
      if (!ok) return;
      try {
        const { threadId: newThreadId } = await apiMutate<{ threadId: string }>('/api/chat/threads/fork', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceThreadId: threadId,
            atMessageId: messageId,
            newText,
          }),
        });
        toast.success('Forked into a new thread');
        // Match newChat(): refresh the server component so the forked
        // thread's messages hydrate into useChat, then navigate. Without
        // the refresh, useChat keeps the source thread's state and the
        // forked thread renders stale messages.
        router.refresh();
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
    const sliced = cur.slice(0, idx);
    setMessages(sliced);
    void sendMessage({ text: newText });
  }, [threadId, router, sendMessage, setMessages, confirm]);

  const isEmpty = messages.length === 0;

  // Last assistant message id — gets the Regenerate affordance.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m && m.role === 'assistant') return m.id;
    }
    return undefined;
  }, [messages]);

  return (
    <div className="bg-bg paint-isolated fixed inset-0 z-50 flex flex-col">
      <ChatTopBar
        threadId={threadId}
        title={title}
        pinnedSymbol={pinnedSymbol}
        threads={initialThreads}
        isStreaming={isStreaming}
        analysisMode={analysisMode}
        onAnalysisModeChange={handleAnalysisModeChange}
        chatModel={chatModel}
        onChatModelChange={handleChatModelChange}
        modelSelectionPending={modelSelectionPending}
      />

      <div ref={setScrollContainer} className="scrollbar-hide no-overscroll relative flex-1 overflow-y-auto">
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
          {showAgentOpinions && agentProgress && (
            <div className="px-3 py-2">
              <AgentDeliberation
                agents={agentProgress.agents}
                mode={agentProgress.mode}
                status={agentProgress.status}
                error={agentProgress.error}
              />
            </div>
          )}
          {isEmpty ? (
            <EmptyChatState
              pinnedSymbol={pinnedSymbol}
              disabled={isStreaming}
              onSelect={(text) => {
                lastUserTextRef.current = text;
                void sendMessage({ text });
              }}
            />
          ) : (
            <MessageList
              threadId={threadId}
              messages={messages}
              isStreaming={isStreaming}
              showTypingIndicator={status === 'submitted'}
              scrollElement={scrollElement}
              lastAssistantId={lastAssistantId}
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
                  'bg-danger/10 text-danger border border-danger/30 mx-3 mb-2 flex items-center justify-between gap-2 rounded-sm p-3 text-xs',
                )}
              >
                <span className="line-clamp-2 flex-1">{error.message}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (lastUserTextRef.current) {
                        void sendMessage({ text: lastUserTextRef.current });
                      }
                    }}
                    aria-label="Retry"
                    className="bg-danger/20 hover:bg-danger/30 border border-danger/30 inline-flex items-center gap-1 rounded-sm px-3 py-1.5 text-body-sm font-medium"
                  >
                    <IconArrowBackUp className="size-3.5" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedError(true)}
                    aria-label="Dismiss error"
                    className="hover:bg-danger/10 text-danger/80 hover:text-danger inline-flex size-7 items-center justify-center rounded-sm transition-colors"
                  >
                    <IconX className="size-4" />
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
              className="scroll-fab surface-elevated text-fg absolute left-1/2 z-30 inline-flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-sm px-4 text-body-sm font-medium transition-all"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
            >
              <IconArrowDown className="size-3.5" />
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
                singleTurnOverrideRef.current = 'single';
              }
              if (images.length === 0) {
                void sendMessage({ text });
              } else {
                void sendMessage({
                  text,
                  files: images.map((img) => ({
                    type: 'file' as const,
                    mediaType: img.mediaType,
                    url: img.url,
                    filename: img.name,
                  })),
                });
              }
            }}
          onStop={() => {
            stop();
          }}
          isStreaming={isStreaming}
          disabled={isStreaming || modelSelectionPending}
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
      <KestrelBrand
        variant="lockup"
        decorative
        priority
        className="w-44 opacity-95"
      />

      <div className="flex max-w-sm flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">What are you watching?</h2>
        <p className="text-fg-muted text-sm leading-relaxed">Ask Kestrel about price action, macro risk, news, or your trading journal.</p>
      </div>

      <div className="w-full max-w-md">
        <QuickPrompts
          onSelect={onSelect}
          pinnedSymbol={pinnedSymbol}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
