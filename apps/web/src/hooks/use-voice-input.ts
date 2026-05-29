'use client';

// Web Speech API hook for the chat composer. Returns:
//   - `supported`: true when the browser exposes SpeechRecognition (or its
//     legacy `webkitSpeechRecognition`).
//   - `active`:    true while a recognition session is running.
//   - `start`:     begin a session at the configured language.
//   - `stop`:      end the session early.
//
// Recognition runs entirely in the browser; no server-side audio leaves
// the device. Interim results stream into `onText` so the textarea can show
// the transcript live; the final transcript is left in the textarea on
// session end so the user can review/edit before submitting.

import { useCallback, useEffect, useRef, useState } from 'react';

// The Web Speech API is non-standard; Safari and Chrome ship it under
// `webkitSpeechRecognition`. We avoid pulling in `dom-speech-recognition`
// so we don't drag a dev-only type package into runtime.
interface SpeechRecognitionResultLike {
  0?: { transcript?: string };
  isFinal?: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export interface UseVoiceInputArgs {
  /** BCP-47 language tag, e.g. `en-US` or `ar-IQ`. */
  lang: string;
  /** Called with the rolling transcript as the user speaks. */
  onText: (transcript: string) => void;
}

export interface UseVoiceInputResult {
  supported: boolean;
  active: boolean;
  start: () => void;
  stop: () => void;
}

export function useVoiceInput({ lang, onText }: UseVoiceInputArgs): UseVoiceInputResult {
  const [active, setActive] = useState(false);
  const ref = useRef<SpeechRecognitionLike | null>(null);
  const [supported, setSupported] = useState(false);

  // `window` access is gated to the client effect to keep this safe in SSR.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSupported(Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition));
  }, []);

  // Stop any in-flight session on unmount so the hook never leaks.
  useEffect(() => {
    return () => {
      ref.current?.abort();
      ref.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (ref.current) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (e) => {
      const results = e.results;
      let transcript = '';
      for (let i = 0; i < results.length; i += 1) {
        const r = results[i];
        if (r && r[0]?.transcript) transcript += r[0].transcript;
      }
      onText(transcript);
    };
    rec.onend = () => {
      setActive(false);
      ref.current = null;
    };
    rec.onerror = (e) => {
      console.warn('[voice-input] recognition error', e);
      setActive(false);
      ref.current = null;
    };

    ref.current = rec;
    setActive(true);
    try {
      rec.start();
    } catch (err) {
      // `start()` throws if a session is already running on the same
      // instance — defensive guard for hot-reload edge cases.
      console.warn('[voice-input] start failed', err);
      ref.current = null;
      setActive(false);
    }
  }, [lang, onText]);

  const stop = useCallback(() => {
    // Phase 3 hardening §10 — optimistic flip. iOS Safari's
    // SpeechRecognition.stop() doesn't reliably fire `onend` (sometimes
    // late, sometimes never), which left the "Listening…" pill stuck
    // on screen. We flip `active` to false immediately so the UI
    // dismisses the pill within the next paint; the eventual `onend`
    // (if it arrives) is a no-op because `active` is already false.
    ref.current?.stop();
    setActive(false);
  }, []);

  return { supported, active, start, stop };
}
