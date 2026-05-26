'use client';

import { useEffect, useState } from 'react';

/**
 * Sticky pill rendered above the BottomNav while the browser reports it is
 * offline. Renders nothing while online. Listens to `online`/`offline` events
 * to flip state. The Retry button calls `location.reload()`. See design §6.
 */
export function OfflineBanner() {
  // Default to `true` so the banner does not flash during SSR/first paint;
  // the effect below reconciles with `navigator.onLine` on mount.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
    };
    const onOffline = () => {
      setOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // Sit above the 64px BottomNav (+ safe-area) with a small gap. Centered,
      // pointer events isolated to the pill itself so the rest of the screen
      // stays interactive.
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)' }}
    >
      <div className="border-border bg-bg-elev-2 text-fg pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg">
        <span className="text-bear text-sm font-medium">No network</span>
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className="border-border hover:bg-bg-elev-1 focus-visible:ring-brand inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border px-3 text-sm font-medium focus:outline-none focus-visible:ring-2"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
