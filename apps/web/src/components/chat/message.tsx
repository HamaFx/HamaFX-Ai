// Renders one chat message — user or assistant. Iterates over UIMessage parts
// and dispatches each to its dedicated renderer. Tool parts go through
// `ChatToolPart`, which routes known tools to bespoke renderers and falls
// back to the generic `ToolCard` for unknown tools.

import type { UIMessage } from 'ai';

import { ChatToolPart, type ToolPartState } from './parts/registry';
import { TextPart } from './parts/text';
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

/** AI SDK v5 streamed tool-part state vocabulary. */
type StreamToolState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error';

/** Translate AI SDK stream-part state to the registry's `ToolPartState`. */
function toPartState(state: StreamToolState): ToolPartState {
  if (state === 'output-available') return 'done';
  if (state === 'output-error') return 'error';
  return 'loading';
}

/** Narrow tool-part fields without resorting to `any`. */
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
