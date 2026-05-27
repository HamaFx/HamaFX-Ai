'use client';

// Message scroll body. Auto-scroll handled by the parent (chat-screen.tsx).

import type { UIMessage } from 'ai';

import { Message } from './message';

interface MessageListProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  onCopy?: (text: string) => void;
}

export function MessageList({ messages, isStreaming, onCopy }: MessageListProps) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        messages.map((m) => <Message key={m.id} message={m} {...(onCopy ? { onCopy } : {})} />)
      )}
      {isStreaming ? (
        <div className="flex justify-start">
          <div className="glass-subtle text-fg flex items-center gap-1 rounded-3xl rounded-bl-md px-4 py-3">
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

function EmptyState() {
  return (
    <div className="text-fg-muted mx-auto max-w-md py-12 text-center">
      <div
        className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-3xl"
        style={{
          background:
            'linear-gradient(135deg, oklch(78% 0.16 78 / 0.2), oklch(72% 0.18 295 / 0.2))',
          boxShadow:
            'inset 0 1px 0 0 oklch(100% 0 0 / 0.1), 0 0 32px -4px oklch(78% 0.16 78 / 0.3)',
        }}
      >
        <svg
          className="text-brand size-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a8 8 0 0 1-11.7 7.1L3 21l1.9-6.3A8 8 0 1 1 21 12Z" />
        </svg>
      </div>
      <p className="text-fg mb-2 text-xl font-bold tracking-tight">How can I help?</p>
      <p className="text-fg-muted text-sm leading-relaxed">
        Bias on gold, top-down read, today&apos;s news, or set an alert.
      </p>
    </div>
  );
}
