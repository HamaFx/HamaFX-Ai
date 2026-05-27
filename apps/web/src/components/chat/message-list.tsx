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
          <div className="bg-bg-elev-1 flex items-center gap-1 rounded-2xl rounded-bl-sm px-3.5 py-2.5">
            <span className="bg-fg-muted size-1.5 animate-pulse rounded-full" />
            <span
              className="bg-fg-muted size-1.5 animate-pulse rounded-full"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="bg-fg-muted size-1.5 animate-pulse rounded-full"
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
    <div className="text-fg-muted mx-auto max-w-md py-12 text-center text-sm">
      <p className="text-fg mb-3 text-base font-semibold">Ask about XAU, EUR, or GBP.</p>
      <p>
        Try: <em>“What&apos;s pushing gold today?”</em> · <em>“EMA 50 trend on EURUSD 1h”</em> ·{' '}
        <em>“Daily pivots for XAU”</em>.
      </p>
    </div>
  );
}
