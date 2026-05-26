'use client';

import { useEffect } from 'react';

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
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
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
