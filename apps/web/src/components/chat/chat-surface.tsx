'use client';

// Top-level chat surface. Wraps `useChat` with our route + threadId, hands
// the messages off to MessageList, and the composer to the SDK's
// sendMessage. Used by /chat/[threadId]/page.tsx.
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { RotateCcw } from 'lucide-react';
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

  return (
    <div className="card-premium flex h-[calc(100svh-11rem)] flex-col overflow-hidden">
      <div className="scrollbar-hide flex-1 overflow-y-auto">
        <MessageList messages={messages} isStreaming={isStreaming} />
        {error ? (
          <div className="bg-bear/10 text-bear ring-bear/30 mx-3 mb-2 flex items-center justify-between gap-2 rounded-xl p-3 text-xs ring-1 backdrop-blur">
            <span className="line-clamp-2 flex-1">{error.message}</span>
            <button
              type="button"
              onClick={() => {
                if (lastUserTextRef.current) {
                  void sendMessage({ text: lastUserTextRef.current });
                }
              }}
              className="bg-bear/20 hover:bg-bear/30 ring-bear/30 inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1"
            >
              <RotateCcw className="size-3" /> Retry
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
