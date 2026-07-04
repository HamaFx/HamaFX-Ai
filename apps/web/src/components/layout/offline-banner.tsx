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

import {IconWifiOff, IconLoader2} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [retrying, setRetrying] = useState(false);

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

  return (
    <AnimatePresence>
      {!online && (
        <m.div
          key="offline-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: 'var(--toast-bottom)' }}
        >
          <div className="surface-elevated text-fg pointer-events-auto flex items-center gap-3 rounded-sm px-4 py-2.5">
            <IconWifiOff className="text-bear size-4" aria-hidden="true" strokeWidth={2.25} />
            <span className="text-body-sm font-medium">No network</span>
            <button
              type="button"
              disabled={retrying}
              onClick={() => {
                setRetrying(true);
                window.location.reload();
              }}
              className="text-fg-muted hover:text-fg focus-visible:ring-fg inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-sm px-3 text-body-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:opacity-60"
            >
              {retrying && <IconLoader2 className="size-3 animate-spin" />}
              Retry
            </button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
