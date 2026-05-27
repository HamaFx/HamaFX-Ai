'use client';

// Premium chat composer.
//
// Mobile-first features:
//   - Auto-grow textarea (min-h 56, max ~200) so the first line is
//     comfortable and 16px text size prevents iOS zoom-on-focus
//   - Image attach (file picker + drag-drop) — up to 4 images per turn
//   - Voice input via Web Speech API
//   - Character count when approaching the limit
//   - Drag-over highlight + drop handling
//   - Sticky-at-bottom with safe-area padding
//   - Glass surface that lifts on focus

import { ImagePlus, Mic, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useVoiceInput } from '@/hooks/use-voice-input';
import { cn } from '@/lib/cn';

export interface ComposerImage {
  id: string;
  dataUrl: string;
  mediaType: string;
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
const MAX_TEXT_CHARS = 8000;
const SOFT_LIMIT_CHARS = 7500;

export function Composer({ onSubmit, disabled, placeholder = 'Ask anything…' }: ComposerProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on desktop after mount and after streaming completes.
  useEffect(() => {
    if (ref.current && !disabled) {
      // Don't steal focus on touch devices — iOS will pop the keyboard.
      const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
      if (!isTouch) ref.current.focus();
    }
  }, [disabled]);

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
      requestAnimationFrame(() => autoGrow());
    },
  });

  function autoGrow() {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    // Cap at 200px (~6 lines) — keeps the message visible above the
    // composer even when expanded.
    t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
  }

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (trimmed.length > MAX_TEXT_CHARS) {
      setImageError(`Message too long (max ${MAX_TEXT_CHARS} chars)`);
      return;
    }
    onSubmit(trimmed, images);
    setValue('');
    setImages([]);
    setImageError(null);
    requestAnimationFrame(() => {
      autoGrow();
      ref.current?.focus();
    });
  }

  function pickImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImageError(null);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setImageError(`Maximum ${MAX_IMAGES} images per message`);
      return;
    }
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!file.type.startsWith('image/')) {
        setImageError('Only image files are accepted');
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
            id:
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`,
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

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      pickImages(dt.files);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragOver(false);
    pickImages(e.dataTransfer.files);
  }

  const charCount = value.length;
  const showCharCount = charCount > SOFT_LIMIT_CHARS;
  const overLimit = charCount > MAX_TEXT_CHARS;

  return (
    <form
      className={cn(
        'glass-strong sticky bottom-0 flex flex-col gap-2 px-3 py-3 transition-shadow duration-200',
        focused && 'shadow-[0_-16px_40px_-8px_oklch(78%_0.16_78/0.15)]',
        dragOver && 'ring-brand/50 ring-2 ring-inset',
      )}
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Attached images">
          {images.map((img, idx) => (
            <li key={img.id} className="relative">
              <img
                src={img.dataUrl}
                alt={`Attached image ${idx + 1} of ${images.length}`}
                className="border-divider size-16 rounded-xl border object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${img.name}`}
                onClick={() => removeImage(img.id)}
                className="bg-bg-elev-3 text-fg border-border focus-visible:ring-brand absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-full border text-sm leading-none focus:outline-none focus-visible:ring-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {imageError ? (
        <p role="alert" className="text-bear text-xs">
          {imageError}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label="Attach image"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || images.length >= MAX_IMAGES}
          className={cn(
            'glass-subtle inline-flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors',
            'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
            disabled || images.length >= MAX_IMAGES
              ? 'text-fg-subtle cursor-not-allowed opacity-60'
              : 'text-fg-muted hover:text-fg',
          )}
        >
          <ImagePlus className="size-5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            pickImages(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />

        <div className="relative flex-1">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={handlePaste}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={MAX_TEXT_CHARS + 100}
            // text-base = 16px so iOS Safari does not auto-zoom on focus.
            // min-h matches the surrounding 48px button row (h-12).
            className={cn(
              'border-divider bg-bg-elev-1/60 backdrop-blur-sm w-full resize-none rounded-2xl border px-4 py-3 text-base leading-relaxed',
              'focus-visible:ring-brand/40 max-h-[200px] min-h-[48px] focus:outline-none focus-visible:ring-2',
              'placeholder:text-fg-subtle text-fg',
              'transition-colors duration-150',
              focused && 'border-brand/50 bg-bg-elev-1/80',
            )}
            onInput={autoGrow}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {showCharCount ? (
            <span
              className={cn(
                'absolute bottom-2 right-3 text-[11px] tabular-nums',
                overLimit ? 'text-bear font-semibold' : 'text-fg-subtle',
              )}
            >
              {charCount}/{MAX_TEXT_CHARS}
            </span>
          ) : null}
        </div>

        {voice.supported ? (
          <button
            type="button"
            aria-label={voice.active ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={voice.active}
            aria-busy={voice.active}
            onClick={() => (voice.active ? voice.stop() : voice.start())}
            disabled={disabled}
            className={cn(
              'glass-subtle inline-flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors',
              'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
              voice.active ? 'text-bear' : 'text-fg-muted hover:text-fg',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            )}
          >
            {voice.active ? <RecordingDot /> : <Mic className="size-5" />}
          </button>
        ) : null}

        <button
          type="submit"
          disabled={disabled || value.trim().length === 0 || overLimit}
          aria-label="Send message"
          className={cn(
            'inline-flex size-12 shrink-0 items-center justify-center rounded-xl font-semibold',
            'text-brand-fg transition-opacity duration-150 hover:opacity-90',
            'disabled:cursor-not-allowed disabled:opacity-40',
            'focus-visible:ring-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
          style={{
            backgroundImage: 'var(--gradient-brand)',
            boxShadow: 'var(--shadow-brand-press)',
          }}
        >
          <Send className="size-5" />
        </button>
      </div>
    </form>
  );
}

function RecordingDot() {
  return (
    <span
      aria-hidden="true"
      className="bg-bear inline-block size-3.5 animate-pulse rounded-full shadow-[0_0_0_3px_rgba(240,89,74,0.25)]"
    />
  );
}
