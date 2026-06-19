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

import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Sticky pill rendered above the home indicator while the browser reports
 * it is offline. Renders nothing while online. Listens to `online`/`offline`
 * events to flip state. The Retry button calls `location.reload()`.
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
      style={{ bottom: 'var(--toast-bottom)' }}
    >
      <div className="glass-strong text-fg pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2.5">
        <WifiOff className="text-bear size-4" aria-hidden="true" strokeWidth={2.25} />
        <span className="text-sm font-medium">No network</span>
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className="text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
