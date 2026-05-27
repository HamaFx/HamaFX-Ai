// Phase 8 PR-18 — Next.js instrumentation hook. Runs once per server
// process (Node + Edge runtimes) before the first request lands.
//
// We initialise Sentry SERVER-ONLY: no @sentry/nextjs client SDK is
// pulled into the browser bundle, which keeps the JS payload identical
// to before and avoids the privacy / replay surface that the client
// SDK adds. Client-side errors continue to surface via the existing
// error boundaries + Vercel function logs.
//
// When SENTRY_DSN is absent the whole hook is a no-op so local dev /
// preview deploys without the env var work the same as before.

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // Two runtimes call this — pick the right SDK init each time.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      // Server-only: do not auto-enable any browser-side transport.
      // (`@sentry/nextjs` only ships the browser bundle when the
      // matching `sentry.client.config.ts` exists; we deliberately
      // never create one.)
      environment: process.env.NODE_ENV,
      initialScope: {
        tags: {
          service: 'web',
          commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
          region: process.env.VERCEL_REGION ?? 'local',
        },
      },
      ignoreErrors: [
        // Client-side aborts that bubble through SSE — not our bugs.
        /AbortError/i,
        /aborted/i,
      ],
    });
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      environment: process.env.NODE_ENV,
      initialScope: {
        tags: {
          service: 'web-edge',
          commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
        },
      },
    });
  }
}

/**
 * Called by Next.js when an error is thrown inside a route handler /
 * Server Action / page render. We forward to Sentry with the request id
 * already plumbed through the response (lib/api.ts).
 */
export async function onRequestError(
  err: { digest?: string },
  request: { path: string; method: string; headers: Record<string, string | string[]> },
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.withScope((scope) => {
    const xrid = request.headers['x-request-id'];
    if (typeof xrid === 'string') scope.setTag('request_id', xrid);
    scope.setTag('route', request.path);
    scope.setTag('method', request.method);
    Sentry.captureException(err);
  });
}
