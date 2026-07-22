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

// Multi-agent SSE chat hook extracted from chat-screen.tsx (H2 audit fix).
//
// Handles:
//   - Custom SSE stream parsing for multi-agent committee deliberation
//   - Job queue polling for background analysis (full mode)
//   - Agent progress state management
//   - Error handling with abort support

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCsrfToken } from '@/lib/csrf';

type AnalysisMode = 'single' | 'quick' | 'standard' | 'full' | 'auto';

interface AgentProgress {
  agents: Array<{
    agentName: string;
    status: 'pending' | 'running' | 'done' | 'error';
    opinion?: { agentName: string; bias: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string };
    error?: string;
  }>;
  mode: string;
}

interface UseMultiAgentChatOptions {
  threadId: string;
  analysisMode: AnalysisMode;
  messagesRef: React.RefObject<UIMessage[] | null>;
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  /** Ref tracking the last user-sent text, used by the error retry button. */
  lastUserTextRef: React.RefObject<string>;
  /** Server-side AI custom instructions; avoids stale localStorage values. */
  customInstructions?: string;
}

interface UseMultiAgentChatResult {
  sendMultiAgentMessage: (text: string) => Promise<void>;
  isMultiAgentStreaming: boolean;
  agentProgress: AgentProgress | null;
  setAgentProgress: React.Dispatch<React.SetStateAction<AgentProgress | null>>;
  multiAgentFetchRef: React.RefObject<AbortController | null>;
}

export function useMultiAgentChat({
  threadId,
  analysisMode,
  messagesRef,
  setMessages,
  lastUserTextRef,
  customInstructions,
}: UseMultiAgentChatOptions): UseMultiAgentChatResult {
  const [isMultiAgentStreaming, setIsMultiAgentStreaming] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null);
  const multiAgentFetchRef = useRef<AbortController | null>(null);

  // Abort on unmount.
  useEffect(() => {
    return () => {
      if (multiAgentFetchRef.current) {
        multiAgentFetchRef.current.abort();
        multiAgentFetchRef.current = null;
      }
    };
  }, []);

  const sendMultiAgentMessage = useCallback(
    async (text: string) => {
      lastUserTextRef.current = text;
      setAgentProgress(null);

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
        const prefsJson = customInstructions ? JSON.stringify({ customInstructions }) : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (csrf) headers['X-CSRF-Token'] = csrf;
        if (prefsJson) headers['X-AI-Prefs'] = prefsJson;

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            threadId,
            analysisMode,
            messages: [...(messagesRef.current ?? []), userMsg],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.error?.message ?? `HTTP ${res.status}`);
        }

        const contentType = res.headers.get('content-type') ?? '';

        // U2 — Full mode: detect queued job response (JSON, not SSE).
        if (contentType.includes('application/json')) {
          const json = (await res.json()) as { type?: string; jobId?: string };
          if (json.type === 'analysis-queued' && json.jobId) {
            await pollBackgroundJob(json.jobId, controller, assistantMsgId, setMessages, setAgentProgress);
            return;
          }
          throw new Error(`Unexpected JSON response: ${JSON.stringify(json)}`);
        }

        // Stream SSE response.
        await streamSSE(res, controller, assistantMsgId, setMessages, setAgentProgress);
      } catch (err) {
        if (controller.signal.aborted) return;
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? ({ ...m, parts: [{ type: 'text' as const, text: `⚠️ Error: ${errMsg}` }] } as UIMessage)
              : m,
          ),
        );
        setAgentProgress(null);
      } finally {
        multiAgentFetchRef.current = null;
        setIsMultiAgentStreaming(false);
      }
    },
    [analysisMode, setMessages, threadId, messagesRef, lastUserTextRef, customInstructions],
  );

  return {
    sendMultiAgentMessage,
    isMultiAgentStreaming,
    agentProgress,
    setAgentProgress,
    multiAgentFetchRef,
  };
}

// ── Background job polling (full mode) ──

async function pollBackgroundJob(
  jobId: string,
  controller: AbortController,
  assistantMsgId: string,
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>,
  setAgentProgress: React.Dispatch<React.SetStateAction<AgentProgress | null>>,
): Promise<void> {
  const MIN_POLL_MS = 2_000;
  const MAX_POLL_MS = 10_000; // STAB-11: cap backoff at 10s
  const MAX_POLL_TIME_MS = 5 * 60_000;
  const startPoll = Date.now();
  let pollIntervalMs = MIN_POLL_MS;

  while (Date.now() - startPoll < MAX_POLL_TIME_MS) {
    if (controller.signal.aborted) return;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    if (controller.signal.aborted) return;

    try {
      const pollRes = await fetch(`/api/chat/analysis-jobs/${jobId}`, {
        headers: { 'X-CSRF-Token': getCsrfToken() ?? '' },
        signal: controller.signal,
      });
      if (!pollRes.ok) continue;
      const pollJson = (await pollRes.json()) as {
        status?: string;
        progress?: Array<Record<string, unknown>>;
        result?: { finalText?: string; agentOpinions?: unknown };
        error?: string;
      };

      if (Array.isArray(pollJson.progress) && pollJson.progress.length > 0) {
        const lastProgress = pollJson.progress[pollJson.progress.length - 1] as
          | Record<string, unknown>
          | undefined;
        if (lastProgress && lastProgress.type === 'data-agent-progress') {
          setAgentProgress((lastProgress as { data: AgentProgress }).data);
        }
      }

      if (pollJson.status === 'complete' && pollJson.result?.finalText) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? ({ ...m, parts: [{ type: 'text' as const, text: pollJson.result!.finalText! }] } as UIMessage)
              : m,
          ),
        );
        setAgentProgress(null);
        return;
      }

      if (pollJson.status === 'failed') {
        throw new Error(pollJson.error ?? 'Background analysis failed.');
      }

      // STAB-11: Reset backoff on successful poll (job still pending but server is responsive).
      pollIntervalMs = MIN_POLL_MS;
    } catch (err) {
      if (controller.signal.aborted) return;
      // STAB-11: Linear backoff on fetch errors to reduce redundant requests.
      pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
      // Only re-throw if the error is not transient (non-2xx HTTP is already skipped via `continue`).
      if (err instanceof TypeError) continue; // Network error — retry with backoff
      throw err;
    }
  }
  throw new Error('Background analysis timed out after 5 minutes.');
}

// ── SSE stream parsing ──

// C2: Throttle setMessages to ~10 updates/sec instead of per-token.
// Uses a mutable ref to accumulate text chunks, then flushes to React
// state on a rAF-aligned cadence — imperceptible to the user but
// reduces state updates by ~10x.
const SSE_FLUSH_INTERVAL_MS = 100;

// STAB-01: Per-chunk read timeout for the SSE stream.
// If the server hangs mid-stream (stuck tool call, network stall), the
// reader.read() call will block indefinitely. Wrapping it in a timeout
// prevents the browser tab from hanging forever — the error propagates
// up and the error banner renders a retry button.
const SSE_READ_TIMEOUT_MS = 120_000; // 2 minutes per chunk

async function streamSSE(
  res: Response,
  controller: AbortController,
  assistantMsgId: string,
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>,
  setAgentProgress: React.Dispatch<React.SetStateAction<AgentProgress | null>>,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';
  let finalText = '';
  let lastFlush = 0;
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;

  const flushText = () => {
    pendingFlush = null;
    const text = finalText;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? ({ ...m, parts: [{ type: 'text' as const, text }] } as UIMessage)
          : m,
      ),
    );
  };

  while (true) {
    // STAB-01: Race reader.read() against a timeout so a hung server
    // stream doesn't block the browser tab indefinitely.
    const readTimeout = AbortSignal.timeout(SSE_READ_TIMEOUT_MS);
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          readTimeout.addEventListener(
            'abort',
            () => reject(new DOMException('SSE stream read timed out', 'TimeoutError')),
            { once: true },
          );
        }),
      ]);
    } catch (err) {
      // Cancel the reader so the underlying stream is released.
      await reader.cancel().catch(() => {});
      throw err;
    }
    const { done, value } = readResult;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (parsed.type === 'data-agent-progress') {
        setAgentProgress(parsed.data as AgentProgress);
      } else if (parsed.type === 'text') {
        finalText += parsed.text as string;
        // Throttle: flush at most every SSE_FLUSH_INTERVAL_MS.
        const now = Date.now();
        if (now - lastFlush >= SSE_FLUSH_INTERVAL_MS) {
          lastFlush = now;
          flushText();
        } else if (!pendingFlush) {
          pendingFlush = setTimeout(() => {
            lastFlush = Date.now();
            flushText();
          }, SSE_FLUSH_INTERVAL_MS - (now - lastFlush));
        }
      } else if (parsed.type === 'error') {
        throw new Error(parsed.error as string);
      }
    }
  }

  // Final flush: ensure all accumulated text is rendered.
  if (pendingFlush) clearTimeout(pendingFlush);
  flushText();
  setAgentProgress(null);
}
