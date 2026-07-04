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

// Sonner toaster. Mounted once in the (app) layout. Replaces inline
// status strings on writes (alert created, journal saved, refresh ok).
//
// Mobile (≤767px): bottom-center, above the home indicator using
// --toast-bottom (= safe-area-inset + 16px). Desktop (≥768px): bottom-right.

import { useEffect, useState } from 'react';
import { Toaster as SonnerToaster, useSonner } from 'sonner';

export function Toaster() {
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right'>('bottom-center');
  const [announcement, setAnnouncement] = useState('');
  const { toasts } = useSonner();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setPosition(mq.matches ? 'bottom-right' : 'bottom-center');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    // Screen-reader announcement for the most recent visible toast.
    // useSonner() already filters out dismissed toasts; we read the
    // public hook instead of the removed internal `toast.subscribe` API.
    const activeToasts = toasts.filter((t) => !t.delete);
    const latest = activeToasts[activeToasts.length - 1];
    if (!latest) return;
    const titleText = typeof latest.title === 'string' ? latest.title : '';
    const descText = typeof latest.description === 'string' ? latest.description : '';
    const text = [titleText, descText].filter(Boolean).join(': ');
    if (text) {
      setAnnouncement(text);
    }
  }, [toasts]);

  return (
    <>
      <SonnerToaster
        position={position}
        offset="var(--toast-bottom)"
        duration={3000}
        gap={8}
        closeButton={false}
        richColors={true}
        toastOptions={{
          classNames: {
            toast:
              'group !rounded-sm !border !border-border !text-fg !shadow-2xl ' +
              '![background:rgba(24,24,27,0.9)] ' +
              '![box-shadow:0_4px_16px_-4px_rgba(0,0,0,0.8)]',
            title: '!text-sm !font-semibold',
            description: '!text-xs !text-fg-muted',
            success: '!border-bull/40',
            error: '!border-bear/40',
            info: '!border-info/40',
            warning: '!border-warn/40',
          },
        }}
      />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </>
  );
}
