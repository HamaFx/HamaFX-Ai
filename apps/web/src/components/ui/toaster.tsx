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
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right'>('bottom-center');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setPosition(mq.matches ? 'bottom-right' : 'bottom-center');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return (
    <SonnerToaster
      position={position}
      offset="var(--toast-bottom)"
      duration={3000}
      gap={8}
      closeButton={false}
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-xl !backdrop-blur-xl !backdrop-saturate-150 !shadow-2xl ' +
            '![background:linear-gradient(135deg,oklch(20%_0.022_265/0.85),oklch(17%_0.018_265/0.95))] ' +
            '!border !border-divider !text-fg ' +
            '![box-shadow:inset_0_1px_0_0_oklch(100%_0_0_/_0.06),0_25px_50px_-12px_oklch(0%_0_0_/_0.5)]',
          title: '!text-sm !font-semibold',
          description: '!text-xs !text-fg-muted',
          success: '!border-bull/40',
          error: '!border-bear/40',
          info: '!border-info/40',
          warning: '!border-warn/40',
        },
      }}
    />
  );
}
