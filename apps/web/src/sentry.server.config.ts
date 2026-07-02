import * as Sentry from '@sentry/nextjs';

// OBS-07 (Phase 5.1): Add `service:web` tag + `release` so events from
// the web app can be cleanly separated from worker events in a shared-DSN
// Sentry project. The worker already tags `service:worker`.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: !!process.env.SENTRY_DSN,
  initialScope: {
    tags: {
      service: 'web',
      ...(process.env.DEPLOYED_SHA ? { release: process.env.DEPLOYED_SHA } : {}),
    },
  },
});
