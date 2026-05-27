'use client';

// Sonner toaster. Mounted once in the (app) layout. Replaces inline
// status strings on writes (alert created, journal saved, refresh ok).
//
// Mobile (≤767px): bottom-center, above BottomNav and home indicator,
// using the --toast-bottom CSS token.
// Desktop (≥768px): bottom-right.

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
