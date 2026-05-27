'use client';

// Settings island that lets the single user enable/disable web push from
// the current device. Mirrors the TestTelegramButton/TestEmailButton
// patterns: three-state result, ≥44×44 tap target, focus ring.
//
// Flow on click (enable):
//   1. Notification.requestPermission()  → must return 'granted'
//   2. navigator.serviceWorker.ready     → wait for the registration
//   3. registration.pushManager.subscribe({ applicationServerKey })
//   4. POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
//
// On click (disable):
//   1. registration.pushManager.getSubscription()
//   2. subscription.unsubscribe()
//   3. POST /api/push/unsubscribe { endpoint }

import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

type Status =
  | { kind: 'idle' }
  | { kind: 'subscribed' }
  | { kind: 'unsubscribed' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string };

export function EnableWebPushButton(): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  // Read the public VAPID key from the env injected at build time. We can't
  // import this directly because the variable name lives in process.env at
  // build time and Next exposes only NEXT_PUBLIC_* on the client.
  useEffect(() => {
    const k = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
    setVapidKey(k.length > 0 ? k : null);
  }, []);

  // Probe browser support + current subscription on mount so we render the
  // right label ("Enable" vs "Disable").
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelled) {
          setStatus({ kind: 'unsupported', message: 'Push not supported in this browser' });
        }
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setStatus({ kind: sub ? 'subscribed' : 'unsubscribed' });
      } catch (err) {
        if (cancelled) return;
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function enable(): void {
    if (!vapidKey) {
      setStatus({
        kind: 'error',
        message: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set in this build',
      });
      return;
    }
    startTransition(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setStatus({ kind: 'error', message: `Notification permission: ${perm}` });
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const key = sub.toJSON();
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            endpoint: key.endpoint,
            keys: { p256dh: key.keys?.p256dh, auth: key.keys?.auth },
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setStatus({ kind: 'error', message: `subscribe HTTP ${res.status}: ${text.slice(0, 120)}` });
          return;
        }
        setStatus({ kind: 'subscribed' });
      } catch (err) {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
      }
    });
  }

  function disable(): void {
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) {
          setStatus({ kind: 'unsubscribed' });
          return;
        }
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
        setStatus({ kind: 'unsubscribed' });
      } catch (err) {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
      }
    });
  }

  if (status.kind === 'unsupported') {
    return (
      <p role="status" className="text-fg-subtle text-xs">
        {status.message}
      </p>
    );
  }

  const isSubscribed = status.kind === 'subscribed';

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={isSubscribed ? disable : enable}
        loading={pending}
        aria-busy={pending}
        className="focus-visible:ring-brand focus-visible:ring-offset-bg min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {pending
          ? isSubscribed
            ? 'Disabling…'
            : 'Enabling…'
          : isSubscribed
            ? 'Disable web push on this device'
            : 'Enable web push on this device'}
      </Button>

      <p role="status" aria-live="polite" className="text-fg-muted min-h-[1.25rem] text-sm">
        {status.kind === 'subscribed' ? (
          <span className="text-fg-muted">Web push enabled on this device.</span>
        ) : status.kind === 'unsubscribed' ? (
          <span className="text-fg-subtle">Not subscribed on this device.</span>
        ) : status.kind === 'error' ? (
          <span className="text-bear">Error: {status.message}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Convert a base64url-encoded VAPID public key into the raw Uint8Array
 * that `pushManager.subscribe` expects for `applicationServerKey`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) out[i] = rawData.charCodeAt(i);
  return out;
}
