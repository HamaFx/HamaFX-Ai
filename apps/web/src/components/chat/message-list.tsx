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
  onEdit?: (messageId: string, newText: string) => void;
}

export function MessageList({
  messages,
  isStreaming,
  lastAssistantId,
  onCopy,
  onRegenerate,
  onEdit,
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
          {...(onEdit ? { onEdit } : {})}
        />
      ))}
      {isStreaming ? (
        <div className="flex justify-start">
          <div
            className="bg-bg-elev-1 border border-divider text-fg flex items-center gap-1 rounded-3xl rounded-bl-md px-4 py-3"
            role="status"
            aria-label="Assistant is responding"
          >
            <span className="bg-brand motion-safe:animate-pulse size-1.5 rounded-full" />
            <span
              className="bg-brand motion-safe:animate-pulse size-1.5 rounded-full"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="bg-brand motion-safe:animate-pulse size-1.5 rounded-full"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
