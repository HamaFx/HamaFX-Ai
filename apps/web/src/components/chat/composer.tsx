'use client';

// Premium chat composer.
//
// New in this iteration:
//   - When `isStreaming` is true the Send button morphs into a Stop button
//     (square indicator + amber ring) wired to the AI SDK's `stop()`.
//   - When voice input is active the mic gets a soft "mic-pulse" ring
//     and a "Listening…" caption appears above the row so the user gets
//     unambiguous state feedback.
//   - Keyboard hint "Enter to send · Shift+Enter for new line" surfaces
//     on focus (desktop only — hidden on touch).
//   - Image thumbnail rail is keyboard-focusable for delete.

import { ArrowUp, ImagePlus, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { useVoiceInput } from '@/hooks/use-voice-input';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

export interface ComposerImage {
  id: string;
  /**
   * Public URL returned by `/api/upload`. The chat-screen ships this
   * to the model in the message's `files` array; pre-Phase-3 this
   * was a `data:` URL embedded inline.
   */
  url: string;
  mediaType: string;
  name: string;
}

interface ComposerProps {
  onSubmit: (text: string, images: ComposerImage[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const DEFAULT_LANG = 'en-US';
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;
const SOFT_LIMIT_CHARS = 7500;

export function Composer({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask anything…',
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect touch once on mount so we can hide desktop-only affordances.
  // Using pointer: coarse correctly targets mobile devices and ignores touch-enabled laptops.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Auto-focus on desktop after mount and after streaming completes.
  useEffect(() => {
    if (ref.current && !disabled && !isTouch) {
      ref.current.focus();
    }
  }, [disabled, isTouch]);

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
    },
  });

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    if (trimmed.length > MAX_TEXT_CHARS) {
      setImageError(`Message too long (max ${MAX_TEXT_CHARS} chars)`);
      return;
    }
    onSubmit(trimmed, images);
    setValue('');
    setImages([]);
    setImageError(null);
    if (!isTouch) {
      requestAnimationFrame(() => ref.current?.focus());
    }
  }

  // Phase 3 hardening §7 — images are pre-uploaded to Supabase
  // Storage via `/api/upload` and only the public URL ships in the
  // chat message. The pre-fix code base64-embedded each image
  // inline, which capped at one small image per Vercel's 4.5 MB body
  // limit.
  async function pickImages(files: FileList | null): Promise<void> {
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
      try {
        const fd = new FormData();
        fd.append('file', file, file.name);
        const res = await fetchCsrf('/api/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setImageError(`Upload failed: ${res.status} ${text.slice(0, 80)}`);
          continue;
        }
        const json = (await res.json()) as { url?: string; mediaType?: string };
        const url = typeof json.url === 'string' ? json.url : null;
        if (!url) {
          setImageError('Upload returned no URL');
          continue;
        }
        setImages((prev) => [
          ...prev,
          {
            id:
              typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`,
            url,
            mediaType: json.mediaType ?? file.type,
            name: file.name,
          },
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        setImageError(`Upload failed: ${message}`);
      }
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
      void pickImages(dt.files);
      return;
    }

    // Phase 1 hardening §12 — clamp pasted text to MAX_TEXT_CHARS so the
    // counter can't pretend the user is "over the cap" while the textarea
    // still accepts more. The textarea's own `maxLength` is now strict,
    // but Safari + some IMEs ignore `maxLength` on paste, so we enforce
    // it here too.
    const pasted = e.clipboardData?.getData('text');
    if (pasted) {
      const target = e.currentTarget;
      const start = target.selectionStart ?? value.length;
      const end = target.selectionEnd ?? value.length;
      const next = `${value.slice(0, start)}${pasted}${value.slice(end)}`;
      if (next.length > MAX_TEXT_CHARS) {
        e.preventDefault();
        setValue(next.slice(0, MAX_TEXT_CHARS));
        setImageError(`Message clipped to ${MAX_TEXT_CHARS} chars`);
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragOver(false);
    void pickImages(e.dataTransfer.files);
  }

  const charCount = value.length;
  const showCharCount = charCount > SOFT_LIMIT_CHARS;
  const overLimit = charCount > MAX_TEXT_CHARS;
  const canSend = !disabled && !isStreaming && value.trim().length > 0 && !overLimit;

  return (
    <div className="sticky bottom-0 px-3 pb-[max(env(safe-area-inset-bottom),12px)] transition-all duration-300 w-full max-w-4xl mx-auto z-20">
      <form
        className={cn(
          'glass-strong relative flex w-full flex-col overflow-hidden rounded-[28px] border border-divider/60 bg-bg-elev-1/60 shadow-lg transition-all duration-300',
          focused && 'border-brand/40 bg-bg-elev-1/80 shadow-[0_8px_32px_-8px_oklch(78%_0.16_78/0.2)] ring-1 ring-brand/30',
          dragOver && 'bg-brand/5 ring-2 ring-inset ring-brand/50',
        )}
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
        {/* Voice listening pill */}
        {voice.active ? (
          <div
            role="status"
            aria-live="polite"
            className="text-bear ring-bear/30 mx-auto mt-3 inline-flex items-center gap-2 self-center rounded-full bg-bear/10 px-3 py-1 text-[11px] font-medium ring-1"
          >
            <span className="bg-bear size-1.5 animate-pulse rounded-full" />
            Listening…
          </div>
        ) : null}

        {/* Attached Images */}
        {images.length > 0 ? (
          <ul className="flex flex-wrap gap-2 px-5 pb-1 pt-4" aria-label="Attached images">
            {images.map((img, idx) => (
              <li key={img.id} className="relative">
                <img
                  src={img.url}
                  alt={`Attached image ${idx + 1} of ${images.length}`}
                  className="border-divider size-14 rounded-xl border object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => removeImage(img.id)}
                  className="bg-bg-elev-3 text-fg border-border focus-visible:ring-brand absolute -right-2 -top-2 inline-flex size-5 items-center justify-center rounded-full border text-[10px] leading-none focus:outline-none focus-visible:ring-2"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {imageError ? (
          <p role="alert" className="text-bear px-5 pt-2 text-xs">
            {imageError}
          </p>
        ) : null}

        {/* Textarea */}
        <div className="relative w-full">
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
            maxLength={MAX_TEXT_CHARS}
            className={cn(
              'text-fg placeholder:text-fg-subtle w-full resize-none bg-transparent px-5 pb-2 text-[15px] leading-relaxed focus:outline-none',
              'max-h-[40dvh] min-h-[56px] transition-colors duration-150',
              images.length > 0 ? 'pt-1' : 'pt-4',
              '[field-sizing:content]',
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>

        {/* Action Row */}
        <div className="flex items-end justify-between px-2 pb-2">
          {/* Left Actions (Attach, Voice) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Attach image"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || images.length >= MAX_IMAGES}
              className={cn(
                'inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
                'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
                disabled || images.length >= MAX_IMAGES
                  ? 'text-fg-subtle cursor-not-allowed opacity-60'
                  : 'text-fg-muted hover:bg-bg-elev-2/50 hover:text-fg',
              )}
            >
              <ImagePlus className="size-[22px]" strokeWidth={1.5} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void pickImages(e.currentTarget.files);
                e.currentTarget.value = '';
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
                  'inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
                  'focus-visible:ring-brand/60 focus:outline-none focus-visible:ring-2',
                  voice.active
                    ? 'text-bear mic-pulse bg-bear/10'
                    : 'text-fg-muted hover:bg-bg-elev-2/50 hover:text-fg',
                  disabled ? 'cursor-not-allowed opacity-60' : '',
                )}
              >
                <Mic className="size-[22px]" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>

          {/* Right Actions (Submit, Stop, Char Count) */}
          <div className="flex items-center gap-3">
            {showCharCount ? (
              <span
                className={cn(
                  'tabular-nums text-[11px]',
                  overLimit ? 'text-bear font-semibold' : 'text-fg-subtle',
                )}
              >
                {charCount}/{MAX_TEXT_CHARS}
              </span>
            ) : null}

            {focused && !isTouch && !isStreaming ? (
              <p className="text-fg-subtle hidden pr-1 text-[10px] tabular-nums sm:block">
                <kbd className="bg-bg-elev-2 ring-divider rounded border px-1.5 font-mono ring-1">
                  Enter
                </kbd>{' '}
                to send
              </p>
            ) : null}

            <AnimatePresence mode="popLayout" initial={false}>
              {isStreaming && onStop ? (
                <motion.button
                  key="stop"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="text-bear ring-bear/40 inline-flex size-[36px] shrink-0 items-center justify-center rounded-full bg-bear/15 focus:outline-none focus-visible:ring-2 ring-1"
                >
                  <Square className="size-[14px] fill-current" strokeWidth={0} />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  className={cn(
                    'text-brand-fg inline-flex size-[36px] shrink-0 items-center justify-center rounded-full font-semibold',
                    'disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale',
                    'focus-visible:ring-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  )}
                  style={{
                    backgroundImage: 'var(--gradient-brand)',
                    boxShadow: canSend ? 'var(--shadow-brand-press)' : 'none',
                  }}
                >
                  <ArrowUp className="size-5" strokeWidth={2.5} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </div>
  );
}
