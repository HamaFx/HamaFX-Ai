'use client';

// Mobile-first chat composer.
//
// Phase 1: textarea + Send.
// Phase 2: voice input via Web Speech API.
// Phase 3: image-attach via the platform file picker. The selected
// images render as thumbnails above the textarea with a remove control;
// on submit they're forwarded as `file` UIMessage parts (data URL +
// mediaType) so the AI SDK can pass them straight to the vision model.
// Phase 5: focus-shadow lift, lucide icons, scale-pop on image add.

import { ImagePlus, Mic, Send } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
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
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount (desktop) and after sending.
  useEffect(() => {
    if (ref.current && !disabled) {
      ref.current.focus();
    }
  }, [disabled]);

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
      className={cn(
        'border-divider bg-bg-elev-1 sticky bottom-0 flex flex-col gap-2 border-t px-3 py-2 transition-shadow duration-200',
        focused && 'shadow-[0_-12px_32px_-8px_rgba(0,0,0,0.4)]',
      )}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <AnimatePresence>
        {images.length > 0 ? (
          <m.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="flex flex-wrap gap-2"
            aria-label="Attached images"
          >
            {images.map((img, idx) => (
              <m.li
                key={img.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="relative"
              >
                <img
                  src={img.dataUrl}
                  alt={`Attached chart image ${idx + 1} of ${images.length}`}
                  className="border-divider h-12 w-12 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => removeImage(img.id)}
                  className="bg-bg-elev-3 text-fg border-border focus-visible:ring-brand absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] focus:outline-none focus-visible:ring-2"
                >
                  ×
                </button>
              </m.li>
            ))}
          </m.ul>
        ) : null}
      </AnimatePresence>

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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'border-divider bg-bg flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-sm',
            'focus-visible:ring-brand/60 max-h-[160px] min-h-[44px] focus:outline-none focus-visible:ring-2',
            'placeholder:text-fg-subtle',
            'transition-colors duration-150',
            focused && 'border-brand/60',
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
            e.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          aria-label="Attach image"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || images.length >= MAX_IMAGES}
          className={cn(
            'border-divider bg-bg-elev-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
            'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
            disabled || images.length >= MAX_IMAGES
              ? 'text-fg-subtle cursor-not-allowed opacity-60'
              : 'text-fg-muted hover:text-fg active:scale-95',
          )}
        >
          <ImagePlus className="size-4" />
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
              'border-divider bg-bg-elev-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
              'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
              voice.active ? 'text-bear' : 'text-fg-muted hover:text-fg active:scale-95',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            )}
          >
            {voice.active ? <RecordingDot /> : <Mic className="size-4" />}
          </button>
        ) : null}

        <Button
          type="submit"
          size="sm"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send message"
          className="h-11 w-11 !p-0 rounded-xl"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </form>
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
