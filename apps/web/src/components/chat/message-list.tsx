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

// Message scroll body. Virtualized using @tanstack/react-virtual to handle
// large threads efficiently, rendering only the visible messages in the DOM.

import type { UIMessage } from 'ai';
import { memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message } from './message';

// Phase 7 task 7.3 — sr-only polite live region so screen readers announce
// streamed assistant text. Mirrors the pattern in chart-canvas.tsx.
function StreamingLiveRegion({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}

interface MessageListProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  showTypingIndicator?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Index of the last assistant message — gets the regenerate affordance. */
  lastAssistantId?: string;
  onCopy?: (text: string) => void;
  onRegenerate?: (opts?: { modelOverride?: string }) => void;
  onEdit?: (messageId: string, newText: string) => void;
}

export const MessageList = memo(function MessageList({
  messages,
  isStreaming,
  showTypingIndicator,
  scrollContainerRef,
  lastAssistantId,
  onCopy,
  onRegenerate,
  onEdit,
}: MessageListProps) {
  const count = messages.length + (showTypingIndicator ? 1 : 0);

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: (index) => {
      const msg = messages[index];
      if (!msg) return 180;
      // More granular estimate based on content type
      const hasToolCall = msg.parts?.some((p) => p.type.startsWith('tool-'));
      const hasMarkdown = msg.parts?.some((p) => p.type === 'text' && p.text.length > 500);
      const hasTables = msg.parts?.some((p) => p.type === 'text' && /\|.*\|/.test(p.text));
      if (hasToolCall) return 500;
      if (hasTables) return 400;
      if (hasMarkdown) return 300;
      if (msg.role === 'user') return 80;
      return 180;
    },
    overscan: 5,
  });

  return (
    <div
      className="relative w-full px-4 py-4"
      style={{
        height: `${rowVirtualizer.getTotalSize()}px`,
      }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const isTypingRow = virtualRow.index === messages.length;

        if (isTypingRow) {
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 'calc(100% - 2rem)', // Account for px-4 padding (1rem on each side)
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="py-2"
            >
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-2 py-3"
                  role="status"
                  aria-label="Assistant is responding"
                >
                  <span className="inline-block h-4 w-0.5 bg-fg motion-safe:animate-pulse" />
                  <span className="text-sm text-fg-muted">Thinking…</span>
                </div>
              </div>
            </div>
          );
        }

        const m = messages[virtualRow.index];
        if (!m) return null;

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 'calc(100% - 2rem)', // Account for px-4 padding (1rem on each side)
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <Message
              message={m}
              {...(isStreaming !== undefined ? { isStreaming } : {})}
              {...(onCopy ? { onCopy } : {})}
              {...(onRegenerate && m.id === lastAssistantId && !isStreaming
                ? { onRegenerate }
                : {})}
              {...(onEdit ? { onEdit } : {})}
            />
            {isStreaming && m.role === 'assistant' && (
              <StreamingLiveRegion
                text={m.parts
                  ?.filter((p) => p.type === 'text')
                  .map((p) => ('text' in p ? p.text : ''))
                  .join('') ?? ''}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
