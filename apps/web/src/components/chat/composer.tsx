'use client';

// Mobile-first chat composer.
//
// Phase 1: textarea + Send.
// Phase 2: voice input via Web Speech API.
// Phase 3: image-attach via the platform file picker. The selected
// images render as thumbnails above the textarea with a remove control;
// on submit they're forwarded as `file` UIMessage parts (data URL +
// mediaType) so the AI SDK can pass them straight to the vision model.

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { cn } from '@/lib/cn';

export interface ComposerImage {
  id: string;
  /** base64 data URL, so the AI SDK can pass it as a `file` part. */
  dataUrl: string;
  /** MIME type from the original file. */
  mediaType: string;
  /** Display name for screen readers. */
  name: string;
}

interface ComposerProps {
  onSubmit: (text: string, images: ComposerImage[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

const DEFAULT_LANG = 'en-US';
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function Composer({ onSubmit, disabled, placeholder = 'Ask anything…' }: ComposerProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice input.
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
    onSubmit(trimmed, images);
    setValue('');
    setImages([]);
    setImageError(null);
    requestAnimationFrame(() => ref.current?.focus());
  }

  function pickImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageError(null);
    const remaining = MAX_IMAGES - images.length;
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!file.type.startsWith('image/')) {
        setImageError('only image files are accepted');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError(`"${file.name}" exceeds 5 MB`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') return;
        setImages((prev) => [
          ...prev,
          {
            id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            dataUrl: result,
            mediaType: file.type,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <form
      className="border-border bg-bg-elev-1 sticky bottom-0 flex flex-col gap-2 border-t px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attached images">
          {images.map((img) => (
            <li key={img.id} className="relative">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="border-border h-12 w-12 rounded border object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${img.name}`}
                onClick={() => removeImage(img.id)}
                className="bg-bg-elev-2 text-fg border-border focus-visible:ring-brand absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] focus:outline-none focus-visible:ring-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {imageError ? (
        <p role="alert" className="text-bear text-[11px]">
          {imageError}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            pickImages(e.currentTarget.files);
            // Reset so re-selecting the same file fires `onChange`.
            e.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          aria-label="Attach image"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || images.length >= MAX_IMAGES}
          className={cn(
            'border-border bg-bg-elev-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors',
            'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
            disabled || images.length >= MAX_IMAGES
              ? 'text-fg-subtle cursor-not-allowed opacity-60'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          <ImageGlyph />
        </button>

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
      </div>
    </form>
  );
}

function ImageGlyph() {
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
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="6" cy="7" r="1.2" />
      <path d="M3 12l3-3 2 2 3-4 2 3" />
    </svg>
  );
}

function MicGlyph() {
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
