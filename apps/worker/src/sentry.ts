// Sentry initialiser for the worker. Server-only — the worker has no
// browser context. Phase 8 PR-18.
//
// When SENTRY_DSN is unset, the wrapper is a no-op so local dev / tests
// never need a Sentry account. Personal-mode keeps tracesSampleRate at
// 0 (we have one user; performance traces are noise we don't pay
// attention to).

import type * as SentryNS from '@sentry/node';

import type { WorkerEnv } from './env.js';

let sentryRef: typeof SentryNS | null = null;

/**
 * Lazy-init Sentry once on worker boot. Returns the loaded module so
 * callers can attach scope tags at the call site without re-importing.
 */
export async function initSentry(
  env: WorkerEnv,
  serviceTag: string,
): Promise<typeof SentryNS | null> {
  if (sentryRef) return sentryRef;
  if (!env.SENTRY_DSN) return null;

  const sentry = await import('@sentry/node');
  sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0,
    environment: env.NODE_ENV,
    initialScope: {
      tags: {
        service: serviceTag,
        commit_sha: env.DEPLOYED_SHA,
      },
    },
    // Drop spam from one-off node fetch errors — they're already tagged
    // by the upstream code.
    ignoreErrors: [/Body is unusable/i, /AbortError/i],
  });
  sentryRef = sentry;
  return sentry;
}

/**
 * Capture an exception if Sentry is initialised. No-op when SENTRY_DSN is
 * missing. Returns the event id (or null) so callers can correlate.
 */
export function captureException(err: unknown, tags?: Record<string, string>): string | null {
  if (!sentryRef) return null;
  if (tags) {
    sentryRef.withScope((scope) => {
      Object.entries(tags).forEach(([k, v]) => scope.setTag(k, v));
      sentryRef!.captureException(err);
    });
    return null;
  }
  return sentryRef.captureException(err) ?? null;
}

/**
 * Drain Sentry's queue before process exit so unhandled-error events
 * aren't lost when the worker crashes.
 */
export async function flushSentry(timeoutMs = 5_000): Promise<void> {
  if (!sentryRef) return;
  try {
    await sentryRef.close(timeoutMs);
  } catch {
    /* ignore — best-effort flush */
  }
}
