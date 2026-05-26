'use client';

// Mobile-first chat composer. Stays pinned above the bottom nav via the
// chat surface's flex layout. Submits on Enter (without Shift), sends via
// the `onSubmit` callback so the surface can talk to `useChat`.

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function Composer({ onSubmit, disabled, placeholder = 'Ask anything…' }: ComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
    requestAnimationFrame(() => ref.current?.focus());
  }

  return (
    <form
      className="border-border bg-bg-elev-1 sticky bottom-0 flex items-end gap-2 border-t px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'border-border bg-bg flex-1 resize-none rounded-md border px-3 py-2 text-sm',
          'min-h-[40px] max-h-[160px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
          'placeholder:text-fg-subtle',
        )}
        onInput={(e) => {
          const t = e.currentTarget;
          t.style.height = 'auto';
          t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <Button type="submit" size="sm" disabled={disabled || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}
