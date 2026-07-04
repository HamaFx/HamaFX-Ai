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

/**
 * <InstallNudge> — PWA install affordance.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 12.
 *
 * Behaviour:
 *   - Chrome / Edge / Android: listens for `beforeinstallprompt`,
 *     stashes the event, renders a one-click "Install HamaFX-Ai"
 *     button. Tapping the button calls `event.prompt()` and waits
 *     for the user's choice.
 *   - iOS Safari: no native install prompt. We detect iOS without
 *     standalone mode and show a text instruction: "Tap IconShare →
 *     Add to Home Screen".
 *   - Already installed (standalone mode): nothing rendered.
 *   - User dismisses three times: stop showing (cap in localStorage).
 *   - SSR-safe: all checks live in useEffect.
 */

import {IconDownload, IconShare, IconX} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hfx_install_dismissed';
const DISMISS_CAP = 3;

interface BeforeInstallPromptEvent extends Event {
  /** Chrome-defined shape. We don't use any of its members but the
   *  TS DOM lib does not include them, so we declare the minimum. */
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallNudge() {
  const [hydrated, setHydrated] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setHydrated(true);

    // Already installed (PWA launched from home screen)?
    const standalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        // iOS-specific marker
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigator as any).standalone === true);
    if (standalone) {
      setInstalled(true);
      return;
    }

    // iOS/iPadOS 13+ detection: userAgent contains iPhone/iPad/iPod OR Macintosh with touch support
    const ua = navigator.userAgent;
    const isMac = /Macintosh/.test(ua);
    const isTouch = 'ontouchend' in window || navigator.maxTouchPoints > 0;
    const isiOS = /iPhone|iPad|iPod/.test(ua) || (isMac && isTouch);
    setIsIOS(isiOS);

    // Dismiss cap.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const count = raw ? Number(raw) : 0;
      if (Number.isFinite(count) && count >= DISMISS_CAP) setDismissed(true);
    } catch {
      /* localStorage may be unavailable in private mode */
    }

    // Chrome / Edge / Android: capture the deferred prompt.
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    function onAppInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (!hydrated || installed || dismissed) return null;

  async function onInstall() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setDeferred(null);
    bumpDismiss();
  }

  function onDismiss() {
    setDismissed(true);
    bumpDismiss();
  }

  function bumpDismiss() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const next = (Number(raw) || 0) + 1;
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  // iOS path: text instruction.
  if (isIOS) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-border bg-bg-elev-2 text-fg-muted mx-3 mt-2 flex items-start gap-3 rounded-sm border p-3 text-caption"
      >
        <IconShare className="text-fg-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="flex-1 leading-snug">
          Install HamaFX-Ai: tap <span className="text-fg font-medium">Share</span>{' '}
          then <span className="text-fg font-medium">Add to Home Screen</span>.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss install hint"
          className="text-fg-subtle hover:text-fg -mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-bg-elev-3"
        >
          <IconX className="size-3.5" />
        </button>
      </div>
    );
  }

  // Chrome / Edge / Android path: deferred prompt button.
  if (deferred) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-border bg-bg-elev-2 mx-3 mt-2 flex items-center gap-3 rounded-sm border p-3"
      >
        <IconDownload className="text-fg-muted size-4 shrink-0" aria-hidden="true" />
        <p className="text-fg-muted flex-1 text-caption leading-snug">
          Install HamaFX-Ai for one-tap access on your device.
        </p>
        <button
          type="button"
          onClick={() => void onInstall()}
          className="text-fg border-border hover:bg-bg-elev-3 inline-flex h-8 items-center rounded-sm border px-3 text-caption font-semibold"
        >
          Install
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss install hint"
          className="text-fg-subtle hover:text-fg inline-flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-bg-elev-3"
        >
          <IconX className="size-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
