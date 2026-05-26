// Plain text part. Whitespace pre-line preserves newlines from the model.
// We deliberately don't run a Markdown renderer here — keeps the bundle
// small and avoids surface for prompt-injection HTML.

import { cn } from '@/lib/cn';

export function TextPart({ text, role }: { text: string; role: 'user' | 'assistant' }) {
  return (
    <p
      className={cn(
        'whitespace-pre-line text-sm leading-relaxed',
        role === 'user' ? 'text-fg' : 'text-fg',
      )}
    >
      {text}
    </p>
  );
}
