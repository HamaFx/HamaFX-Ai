'use client';

// Mobile-first chat composer. Stays pinned above the bottom nav via the
// chat surface's flex layout. Submits on Enter (without Shift), sends via
// the `onSubmit` callback so the surface can talk to `useChat`.
//
// Phase 2 added voice input: a microphone button between the textarea and
// the Send button. While a recognition session is active a pulsing red
// dot indicates recording; interim transcripts stream into the textarea
// so the user can see what's being captured. On session end the transcript
// is left in the textarea — submission never auto-fires.
import { useEffect, useRef, useState } from 'react';

import { useVoiceInput } from '@/hooks/use-voice-input';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

interface ComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const DEFAULT_LANG = 'en-US';

export function Composer({ onSubmit, disabled, placeholder = 'Ask anything…' }: ComposerProps) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Voice input — language defaults to the browser's preferred locale, falls
  // back to en-US when navigator is absent (SSR boundary).
  const [lang, setLang] = useState(DEFAULT_LANG);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.language) {
      setLang(navigator.language);
    }
  }, []);
  const voice = useVoiceInput({
    lang,
    onText: (transcript) => {
      setValue(transcript);
      // Resize the textarea to fit the new content so long dictations don't clip.
      requestAnimationFrame(() => {
        const t = ref.current;
        if (!t) return;
        t.style.height = 'auto';
        t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
      });
    },
  });

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
          'focus-visible:ring-brand/60 max-h-[160px] min-h-[40px] focus:outline-none focus-visible:ring-2',
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

      {voice.supported ? (
        <button
          type="button"
          aria-label={voice.active ? 'Stop voice input' : 'Start voice input'}
          aria-pressed={voice.active}
          aria-busy={voice.active}
          onClick={() => (voice.active ? voice.stop() : voice.start())}
          disabled={disabled}
          className={cn(
            'border-border bg-bg-elev-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors',
            'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
            voice.active ? 'text-bear' : 'text-fg-muted hover:text-fg',
            disabled ? 'cursor-not-allowed opacity-60' : '',
          )}
        >
          {voice.active ? <RecordingDot /> : <MicGlyph />}
        </button>
      ) : null}

      <Button type="submit" size="sm" disabled={disabled || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}

function MicGlyph() {
  // Inline SVG to avoid an icon-lib dep. 16px square, currentColor.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M3 8a5 5 0 0 0 10 0" />
      <path d="M8 13v2" />
    </svg>
  );
}

function RecordingDot() {
  return (
    <span
      aria-hidden="true"
      className="bg-bear inline-block h-3 w-3 animate-pulse rounded-full shadow-[0_0_0_3px_rgba(240,89,74,0.25)]"
    />
  );
}
