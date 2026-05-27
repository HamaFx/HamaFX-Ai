'use client';

// One chat message. Iterates over UIMessage parts and dispatches each to
// its dedicated renderer. Tool parts go through `ChatToolPart`. Adds a
// hover-revealed copy button on assistant messages so the user can grab
// the text fast.

import type { UIMessage } from 'ai';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

import { ChatToolPart, type ToolPartState } from './parts/registry';
import { TextPart } from './parts/text';

interface MessageProps {
  message: UIMessage;
  onCopy?: (text: string) => void;
}

export function Message({ message, onCopy }: MessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  // Extract plain text for the copy action.
  const plainText = extractText(message);

  function copy() {
    if (!plainText) return;
    void navigator.clipboard.writeText(plainText);
    onCopy?.(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className={cn('group flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative flex max-w-[88%] flex-col gap-1.5 px-4 py-2.5',
          isUser
            ? 'text-brand-fg rounded-3xl rounded-br-md font-medium shadow-sm'
            : 'glass-subtle text-fg rounded-3xl rounded-bl-md',
        )}
        style={
          isUser
            ? {
                background:
                  'linear-gradient(135deg, oklch(80% 0.16 78) 0%, oklch(74% 0.18 60) 100%)',
                boxShadow:
                  'inset 0 1px 0 0 oklch(100% 0 0 / 0.15), 0 4px 12px -4px oklch(78% 0.16 78 / 0.4)',
              }
            : undefined
        }
      >
        {message.parts.map((part, idx) => renderPart(part, idx, message.role))}

        {/* Copy action — assistant only, hover-revealed, anchored bottom-right */}
        {!isUser && plainText.length > 0 ? (
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? 'Copied' : 'Copy message'}
            className={cn(
              'glass-strong text-fg-muted hover:text-fg absolute -bottom-3 right-2',
              'inline-flex h-7 w-7 items-center justify-center rounded-full',
              'opacity-0 transition-opacity duration-150',
              'group-hover:opacity-100 focus-visible:opacity-100',
              'focus-visible:ring-brand focus:outline-none focus-visible:ring-2',
            )}
          >
            {copied ? (
              <Check className="text-bull size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** AI SDK v5 streamed tool-part state vocabulary. */
type StreamToolState = 'input-streaming' | 'input-available' | 'output-available' | 'output-error';

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
