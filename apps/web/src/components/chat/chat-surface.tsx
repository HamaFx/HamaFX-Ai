'use client';

// Top-level chat surface. Wraps `useChat` with our route + threadId, hands
// the messages off to MessageList, and the composer to the SDK's
// sendMessage. Used by /chat/[threadId]/page.tsx.

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useMemo } from 'react';

import { Composer } from './composer';
import { MessageList } from './message-list';

interface ChatSurfaceProps {
  threadId: string;
  initialMessages: UIMessage[];
}

export function ChatSurface({ threadId, initialMessages }: ChatSurfaceProps) {
  // Memoise the transport so `useChat` doesn't recreate it on every render.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        // The route handler reads `threadId` from the body — we inject it
        // via `body` on the transport so callers don't have to pass it on
        // every sendMessage().
        prepareSendMessagesRequest: ({ messages, id }) => ({
          body: { threadId, id, messages },
        }),
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
  });

  const isStreaming = status === 'submitted' || status === 'streaming';

  return (
    <div className="border-border bg-bg flex h-[calc(100svh-9rem)] flex-col overflow-hidden rounded-lg border">
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} isStreaming={isStreaming} />
        {error ? (
          <div className="bg-bear/10 text-bear mx-3 mb-2 rounded-md p-2 text-xs">
            {error.message}
          </div>
        ) : null}
      </div>
      <Composer
        onSubmit={(text) => sendMessage({ text })}
        disabled={isStreaming}
        placeholder="Ask about XAU, EUR, GBP…"
      />
    </div>
  );
}
