'use client';

// Message scroll body. Auto-scroll handled by the parent (chat-screen.tsx).
// Empty state is rendered by chat-screen, not here — this file is concerned
// only with rendering an existing message stream + the typing dots.

import type { UIMessage } from 'ai';

import { Message } from './message';

interface MessageListProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  /** Index of the last assistant message — gets the regenerate affordance. */
  lastAssistantId?: string;
  onCopy?: (text: string) => void;
  onRegenerate?: (opts?: { modelOverride?: string }) => void;
}

export function MessageList({
  messages,
  isStreaming,
  lastAssistantId,
  onCopy,
  onRegenerate,
}: MessageListProps) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {messages.map((m) => (
        <Message
          key={m.id}
          message={m}
          {...(onCopy ? { onCopy } : {})}
          {...(onRegenerate && m.id === lastAssistantId && !isStreaming
            ? { onRegenerate }
            : {})}
        />
      ))}
      {isStreaming ? (
        <div className="flex justify-start">
          <div
            className="glass-subtle text-fg flex items-center gap-1 rounded-3xl rounded-bl-md px-4 py-3"
            role="status"
            aria-label="Assistant is responding"
          >
            <span className="bg-brand size-1.5 animate-pulse rounded-full" />
            <span
              className="bg-brand size-1.5 animate-pulse rounded-full"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="bg-brand size-1.5 animate-pulse rounded-full"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
