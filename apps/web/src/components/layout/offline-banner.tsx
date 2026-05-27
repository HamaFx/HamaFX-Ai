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
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: 'calc(96px + env(safe-area-inset-bottom) + 12px)' }}
    >
      <div className="glass-strong text-fg pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2.5">
        <span className="bg-bear inline-block size-2 animate-pulse rounded-full" />
        <span className="text-sm font-medium">No network</span>
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className="text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex min-h-[36px] items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
