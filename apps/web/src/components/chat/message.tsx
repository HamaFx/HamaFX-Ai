'use client';

// One chat message. Iterates over UIMessage parts and dispatches each to
// its dedicated renderer.
//
// Action row appears on hover (desktop) / focus (keyboard) at the bottom-
// right of the bubble:
//   - Copy (always, when the message has plain text)
//   - Regenerate (only for the last assistant message, drives `regenerate()`)
//
// Both controls are 32×32 pills that stack horizontally so they don't
// require absolute layout gymnastics on narrow viewports.

import type { UIMessage } from 'ai';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

import { ChatToolPart, type ToolPartState } from './parts/registry';
import { TextPart } from './parts/text';

interface MessageProps {
  message: UIMessage;
  onCopy?: (text: string) => void;
  onRegenerate?: () => void;
}

export function Message({ message, onCopy, onRegenerate }: MessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const plainText = extractText(message);
  const hasActions = !isUser && (plainText.length > 0 || onRegenerate);

  function copy() {
    if (!plainText) return;
    void navigator.clipboard.writeText(plainText);
    onCopy?.(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className={cn('group flex w-full flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative flex max-w-[88%] flex-col gap-2 px-4 py-3',
          isUser
            ? 'text-brand-fg rounded-3xl rounded-br-md font-medium shadow-sm'
            : 'glass-subtle text-fg rounded-3xl rounded-bl-md',
        )}
        style={
          isUser
            ? {
                backgroundImage: 'var(--gradient-brand)',
                boxShadow:
                  'inset 0 1px 0 0 oklch(100% 0 0 / 0.15), 0 4px 12px -4px oklch(78% 0.16 78 / 0.4)',
              }
            : undefined
        }
      >
        {message.parts.map((part, idx) => renderPart(part, idx, message.role))}
      </div>

      {/* Action row — only assistant messages, only when there's something
          to do. Visible on hover/focus, accessible via keyboard. */}
      {hasActions ? (
        <div
          className={cn(
            'mr-2 flex items-center gap-1 transition-opacity duration-150',
            'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            'sm:opacity-0', // re-assert in case base opacity was bumped
          )}
        >
          {plainText.length > 0 ? (
            <Tooltip label={copied ? 'Copied' : 'Copy'}>
              <button
                type="button"
                onClick={copy}
                aria-label={copied ? 'Copied' : 'Copy message'}
                className="glass-subtle text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2"
              >
                {copied ? (
                  <Check className="text-bull size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </Tooltip>
          ) : null}
          {onRegenerate ? (
            <Tooltip label="Regenerate">
              <button
                type="button"
                onClick={onRegenerate}
                aria-label="Regenerate response"
                className="glass-subtle text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex size-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** AI SDK v5 streamed tool-part state vocabulary. */
type StreamToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

function toPartState(state: StreamToolState): ToolPartState {
  if (state === 'output-available') return 'done';
  if (state === 'output-error') return 'error';
  return 'loading';
}

interface StreamToolPart {
  state?: StreamToolState;
  output?: unknown;
  errorText?: string;
}

function renderPart(
  part: UIMessage['parts'][number],
  idx: number,
  role: UIMessage['role'],
): React.ReactNode {
  if (part.type === 'text') {
    return <TextPart key={idx} text={part.text} role={role === 'user' ? 'user' : 'assistant'} />;
  }
  if (part.type === 'reasoning') return null;
  if (part.type.startsWith('source-') || part.type === 'file' || part.type === 'step-start')
    return null;

  if (part.type.startsWith('tool-')) {
    const p = part as StreamToolPart;
    const name = part.type.slice('tool-'.length);
    const streamState: StreamToolState = p.state ?? 'output-available';
    const errorMessage = p.errorText;
    return (
      <ChatToolPart
        key={idx}
        name={name}
        output={p.output ?? null}
        state={toPartState(streamState)}
        {...(errorMessage !== undefined ? { errorMessage } : {})}
      />
    );
  }
  return null;
}

function extractText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}
