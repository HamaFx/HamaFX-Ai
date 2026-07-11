'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>
        <div
          role="alert"
          style={{
            display: 'flex',
            minHeight: '100dvh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: 'var(--color-fg, #F0F0F0)',
            background: 'var(--color-bg, #0A0A0A)',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Something went wrong
          </h1>
          <p
            style={{
              maxWidth: '36rem',
              fontSize: '0.875rem',
              color: 'var(--color-fg-muted, #808080)',
              margin: '0 0 1.5rem',
            }}
          >
            An unexpected error occurred.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              background: 'var(--color-brand, #F56E0F)',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
