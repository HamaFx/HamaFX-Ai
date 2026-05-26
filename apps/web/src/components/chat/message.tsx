// Renders one chat message — user or assistant. Iterates over UIMessage parts
// and dispatches each to its dedicated renderer. Tool parts get the generic
// ToolCard; text parts get plain prose.

import type { UIMessage } from 'ai';

import { TextPart } from './parts/text';
import { ToolCard } from './parts/tool-card';
import { cn } from '@/lib/cn';

interface MessageProps {
  message: UIMessage;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'flex max-w-[85%] flex-col gap-1.5 rounded-lg px-3 py-2',
          isUser ? 'bg-brand text-brand-fg' : 'bg-bg-elev-1 text-fg',
        )}
      >
        {message.parts.map((part, idx) => renderPart(part, idx, message.role))}
      </div>
    </div>
  );
}

function renderPart(
  part: UIMessage['parts'][number],
  idx: number,
  role: UIMessage['role'],
): React.ReactNode {
  // Text part: { type: 'text', text }
  if (part.type === 'text') {
    return <TextPart key={idx} text={part.text} role={role === 'user' ? 'user' : 'assistant'} />;
  }
  // Reasoning part (some models stream their internal monologue) — hide it
  // by default to keep the surface clean.
  if (part.type === 'reasoning') return null;
  // Source / file / step parts — not used in Phase 1b.
  if (part.type.startsWith('source-') || part.type === 'file' || part.type === 'step-start')
    return null;

  // Tool parts — `tool-<name>`. AI SDK v5 sends:
  //   { type: 'tool-<name>', toolCallId, state, input, output?, errorText? }
  if (part.type.startsWith('tool-')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = part as any;
    return (
      <ToolCard
        key={idx}
        name={part.type}
        state={p.state ?? 'output-available'}
        input={p.input}
        output={p.output}
        errorText={p.errorText}
      />
    );
  }
  return null;
}
