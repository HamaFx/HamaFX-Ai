'use client';

// Message scroll body. Auto-scroll handled by the parent (chat-screen.tsx).

import type { UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';

import { Message } from './message';

interface MessageListProps {
  messages: UIMessage[];
  isStreaming?: boolean;
  onCopy?: (text: string) => void;
}

export function MessageList({ messages, isStreaming, onCopy }: MessageListProps) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {messages.length === 0 ? (
        <EmptyState
          bare
          tone="brand"
          icon={<Sparkles className="size-8" strokeWidth={1.75} />}
          title="How can I help?"
          description="Bias on gold, top-down read, today's news, or set an alert."
          className="my-12"
        />
      ) : (
        messages.map((m) => <Message key={m.id} message={m} {...(onCopy ? { onCopy } : {})} />)
      )}
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
