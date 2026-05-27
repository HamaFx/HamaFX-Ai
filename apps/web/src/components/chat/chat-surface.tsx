'use client';

// Top-level chat surface. Wraps `useChat` with our route + threadId, hands
// the messages off to MessageList, and the composer to the SDK's
// sendMessage. Used by /chat/[threadId]/page.tsx.
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useRef, useMemo } from 'react';

import { Composer } from './composer';
import { MessageList } from './message-list';
import { QuickPrompts } from './quick-prompts';

interface ChatSurfaceProps {
  threadId: string;
  initialMessages: UIMessage[];
}

export function ChatSurface({ threadId, initialMessages }: ChatSurfaceProps) {
  const lastUserTextRef = useRef<string>('');

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

  function handleSend(text: string, images: Parameters<typeof sendMessage>[0] extends object ? never : never) {
    lastUserTextRef.current = text;
  }

  return (
    <div className="border-border bg-bg flex h-[calc(100svh-9rem)] flex-col overflow-hidden rounded-lg border">
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} isStreaming={isStreaming} />
        {error ? (
          <div className="bg-bear/10 text-bear mx-3 mb-2 flex items-center justify-between gap-2 rounded-md p-2 text-xs">
            <span>{error.message}</span>
            <button
              type="button"
              onClick={() => {
                if (lastUserTextRef.current) {
                  void sendMessage({ text: lastUserTextRef.current });
                }
              }}
              className="bg-bear/20 hover:bg-bear/30 shrink-0 rounded px-2 py-1 text-[10px] font-medium"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>
      {messages.length <= 1 && !isStreaming ? (
        <QuickPrompts
          onSelect={(text) => {
            lastUserTextRef.current = text;
            void sendMessage({ text });
          }}
          disabled={isStreaming}
        />
      ) : null}
      <Composer
        onSubmit={(text, images) => {
          lastUserTextRef.current = text;
          if (images.length === 0) {
            void sendMessage({ text });
            return;
          }
          void sendMessage({
            text,
            files: images.map((img) => ({
              type: 'file' as const,
              mediaType: img.mediaType,
              url: img.dataUrl,
              filename: img.name,
            })),
          });
        }}
        disabled={isStreaming}
        placeholder="Ask about XAU, EUR, GBP…"
      />
    </div>
  );
}
