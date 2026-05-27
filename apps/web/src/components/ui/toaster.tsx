'use client';

// Sonner toaster. Mounted once in the (app) layout. Replaces inline
// status strings on writes (alert created, journal saved, refresh ok).
//
// Mobile (≤767px): bottom-center, above BottomNav and home indicator.
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
      offset="calc(80px + env(safe-area-inset-bottom))"
      duration={3000}
      gap={8}
      closeButton={false}
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            'group !border !border-border !bg-bg-elev-2 !text-fg !shadow-lg !rounded-lg',
          title: '!text-sm !font-medium',
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
