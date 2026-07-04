'use client';

/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Premium chat composer.
//
// New in this iteration:
//   - When `isStreaming` is true the IconArrowRight button morphs into a Stop button
//     (square indicator + amber ring) wired to the AI SDK's `stop()`.
//   - When voice input is active the mic gets a soft "mic-pulse" ring
//     and a "Listening…" caption appears above the row so the user gets
//     unambiguous state feedback.
//   - Keyboard hint "Enter to send · Shift+Enter for new line" surfaces
//     on focus (desktop only — hidden on touch).
//   - Image thumbnail rail is keyboard-focusable for delete.

import {IconArrowUp, IconPhotoPlus, IconMicrophone, IconSquare} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { toast } from 'sonner';

import { useVoiceInput } from '@/hooks/use-voice-input';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

import {
  MAX_TEXT_CHARS,
  formatCharCount,
  getCharCountTone,
} from './composer-helpers';

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
// MAX_TEXT_CHARS and SOFT_LIMIT_CHARS are imported from ./composer-helpers
// so the thresholds can be unit-tested and shared with the route layer if
// the cap ever needs server-side enforcement.

export function Composer({
  onSubmit,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask anything…',
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    onError: (msg) => {
      toast.error(msg);
    },
  });

  function send() {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    if (trimmed.length > MAX_TEXT_CHARS) {
      setError(`Message too long (max ${MAX_TEXT_CHARS} chars)`);
      return;
    }
    onSubmit(trimmed, images);
    setValue('');
    setImages([]);
    setError(null);
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
    setError(null);
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per message`);
      return;
    }

    const chosenFiles = Array.from(files).slice(0, remaining);
    
    // Create upload promises
    const uploadPromises = chosenFiles.map(async (file) => {
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are accepted');
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error(`"${file.name}" exceeds 5 MB`);
      }
      
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetchCsrf('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`IconUpload failed for "${file.name}": ${res.status} ${text.slice(0, 80)}`);
      }
      const json = (await res.json()) as { url?: string; mediaType?: string };
      const url = typeof json.url === 'string' ? json.url : null;
      if (!url) {
        throw new Error(`IconUpload returned no URL for "${file.name}"`);
      }
      
      return {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        url,
        mediaType: json.mediaType ?? file.type,
        name: file.name,
      };
    });

    const results = await Promise.allSettled(uploadPromises);
    
    const succeeded: ComposerImage[] = [];
    const uploadErrors: string[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
      } else {
        uploadErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    }
    
    if (succeeded.length > 0) {
      setImages((prev) => [...prev, ...succeeded]);
    }
    if (uploadErrors.length > 0) {
      setError(uploadErrors.join(', '));
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
        setError(`Message clipped to ${MAX_TEXT_CHARS} chars`);
        
        const cursorPosition = Math.min(start + pasted.length, MAX_TEXT_CHARS);
        requestAnimationFrame(() => {
          if (ref.current) {
            ref.current.setSelectionRange(cursorPosition, cursorPosition);
          }
        });
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragOver(false);
    void pickImages(e.dataTransfer.files);
  }

  const charCount = value.length;
  const overLimit = charCount > MAX_TEXT_CHARS;
  const canSend = !disabled && !isStreaming && value.trim().length > 0 && !overLimit;

  // Char-count tone — pure helper from composer-helpers so the
  // thresholds are unit-tested in test/composer-helpers.test.ts.
  const charCountTone = getCharCountTone(charCount);
  const charCountClass =
    charCountTone === 'danger'
      ? 'text-bear font-semibold'
      : charCountTone === 'warn'
        ? 'text-warn font-medium'
        : 'text-fg-subtle';

  return (
    <div className="sticky bottom-0 px-3 pb-[max(env(safe-area-inset-bottom),12px)] transition-all duration-300 w-full max-w-4xl mx-auto z-20">
      <form
        className={cn(
          'bg-bg-elev-1 border border-border relative flex w-full flex-col overflow-hidden rounded-sm shadow-md transition-all duration-300',
          focused && 'border-border',
          dragOver && 'ring-2 ring-inset ring-zinc-600',
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
            className="text-bear border border-bear/30 mx-auto mt-3 inline-flex items-center gap-2 self-center rounded-sm bg-bear/10 px-3 py-1 text-body-sm font-medium"
          >
            <span className="bg-bear motion-safe:animate-pulse size-1.5 rounded-sm" />
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
                  className="border-border size-14 rounded-sm border object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => removeImage(img.id)}
                  className="bg-bg-elev-3 text-fg border-border focus-visible:ring-fg absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-sm border text-caption leading-none focus:outline-none focus-visible:ring-2"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p id="composer-error" role="alert" className="text-bear px-5 pt-2 text-xs">
            {error}
          </p>
        ) : null}

        {/* Textarea & Actions Row */}
        <div className="flex items-end gap-2 px-2 pb-2 pt-2">
          {/* Left Actions (Attach, Voice) */}
          <div className="flex items-center gap-1 pb-0.5">
            <button
              type="button"
              aria-label="Attach image"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || images.length >= MAX_IMAGES}
              className={cn(
                'inline-flex size-[44px] shrink-0 items-center justify-center rounded-sm transition-colors',
                'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2',
                disabled || images.length >= MAX_IMAGES
                  ? 'text-fg-subtle cursor-not-allowed opacity-60'
                  : 'text-fg-muted hover:bg-bg-elev-2/50 hover:text-fg',
              )}
            >
              <IconPhotoPlus className="size-[20px]" strokeWidth={1.5} />
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
                onClick={() => (voice.active ? voice.stop() : voice.start())}
                disabled={disabled}
                className={cn(
                  'inline-flex size-[44px] shrink-0 items-center justify-center rounded-sm transition-colors',
                  'focus-visible:ring-fg/60 focus:outline-none focus-visible:ring-2',
                  voice.active
                    ? 'text-bear mic-pulse bg-bear/10'
                    : 'text-fg-muted hover:bg-bg-elev-2/50 hover:text-fg',
                  disabled ? 'cursor-not-allowed opacity-60' : '',
                )}
              >
                <IconMicrophone className="size-[20px]" strokeWidth={1.5} />
              </button>
            ) : null}
          </div>

          {/* Textarea */}
          <div className="relative flex-1">
            <textarea
              ref={ref}
              aria-label="Chat message input"
              aria-describedby={error ? 'composer-error' : undefined}
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
                'text-fg placeholder:text-fg-subtle w-full resize-none bg-transparent px-2 py-2.5 text-body leading-[1.4] focus:outline-none',
                'max-h-[40dvh] min-h-[44px] transition-colors duration-150',
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

          {/* Right Actions (Submit, Stop, Char Count) */}
          <div className="flex items-center gap-3 pb-0.5 pr-1">
            {/*
              Char count — visible always per UX_UPGRADE_PLAN.md item 2.
              Tone shifts at the SOFT_LIMIT_CHARS threshold so the
              user gets advance notice before hitting MAX_TEXT_CHARS.
              `aria-live="polite"` so screen readers announce the
              threshold cross without spamming every keystroke.
            */}
            <span
              aria-live="polite"
              aria-label={`${charCount} of ${MAX_TEXT_CHARS} characters used`}
              className={cn('tabular-nums text-body-sm', charCountClass)}
            >
              {formatCharCount(charCount)}
            </span>

            {focused && !isTouch && !isStreaming ? (
              <p className="text-fg-subtle hidden pr-1 text-caption tabular-nums sm:block">
                <kbd className="bg-bg-elev-2 border border-border rounded-sm px-1.5 font-mono">
                  Enter
                </kbd>{' '}
                to send
              </p>
            ) : null}

            <AnimatePresence mode="popLayout" initial={false}>
              {isStreaming && onStop ? (
                <m.button
                  key="stop"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="text-bear border border-bear/40 inline-flex size-[44px] shrink-0 items-center justify-center rounded-sm bg-bear/15 focus:outline-none focus-visible:ring-2"
                >
                  <IconSquare className="size-[14px] fill-current" strokeWidth={0} />
                </m.button>
              ) : (
                <m.button
                  key="send"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  type="submit"
                  disabled={!canSend}
                  aria-label="ArrowRight message"
                  className={cn(
                    'text-black bg-fg hover:bg-fg-muted inline-flex size-[44px] shrink-0 items-center justify-center rounded-sm font-semibold',
                    'disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale',
                    'focus-visible:ring-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  )}
                >
                  <IconArrowUp className="size-[18px]" strokeWidth={2.5} />
                </m.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </div>
  );
}
