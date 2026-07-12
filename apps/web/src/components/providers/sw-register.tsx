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

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Registers the service worker once, deferred until the browser is idle so we
 * don't compete with first paint. Fire-and-forget: failures are warned, never
 * thrown — registration is best-effort. See design §6.
 */
export function SwRegister(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    const register = (): void => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                toast.info('Update available', {
                  action: {
                    label: 'Reload',
                    onClick: () => {
                      newWorker.postMessage({ type: 'SKIP_WAITING' });
                      window.location.reload();
                    },
                  },
                  duration: 10000,
                });
              }
            });
          });
        })
        .catch((err: unknown) => {
          console.warn('[sw] register failed', err);
        });
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(register);
      return () => {
        if (typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(id);
        }
      };
    }
    const t = window.setTimeout(register, 200);
    return () => {
      window.clearTimeout(t);
    };
  }, []);
  return null;
}
