'use client';

// Auto-scrolls to the bottom whenever messages change OR a new tool part
// streams in. Uses an IntersectionObserver-based "is the bottom visible?"
// check so we don't snap-scroll if the user has scrolled up to read history.
import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';

import { Message } from './message';

interface MessageListProps {
  messages: UIMessage[];
  /** True while a model response is in flight — shows a typing indicator. */
  isStreaming?: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (!bottomRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        stickToBottomRef.current = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isStreaming]);

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        messages.map((m) => <Message key={m.id} message={m} />)
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
      <div ref={bottomRef} aria-hidden />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-fg-muted mx-auto max-w-md py-16 text-center">
      <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, oklch(78% 0.16 78 / 0.2), oklch(72% 0.18 295 / 0.2))',
          boxShadow: 'inset 0 1px 0 0 oklch(100% 0 0 / 0.1), 0 0 32px -4px oklch(78% 0.16 78 / 0.3)',
        }}
      >
        <svg
          className="text-brand size-7"
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
      <p className="text-fg mb-2 text-lg font-semibold tracking-tight">Ask anything</p>
      <p className="text-fg-muted text-sm leading-relaxed">
        Bias on gold, top-down read, today&apos;s news, or set an alert.
      </p>
    </div>
  );
}
