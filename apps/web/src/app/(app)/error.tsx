'use client';

// Per-segment error boundary for the (app) group. Keeps the chrome (top bar
// + bottom nav) intact while showing an inline failure card — better than
// the root error.tsx which hides everything.

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error('[app] segment error', error);
  }, [error]);

  return (
    <div className="border-bear/30 bg-bear/5 flex flex-col gap-3 rounded-lg border p-4">
      <h1 className="text-bear text-base font-semibold">Couldn&apos;t load this page</h1>
      <p className="text-fg-muted text-sm">
        {error.message || 'Something went wrong while rendering.'}
      </p>
      {error.digest ? (
        <p className="text-fg-subtle text-[10px] tabular-nums">digest: {error.digest}</p>
      ) : null}
      <div>
        <Button type="button" onClick={() => reset()} size="sm" variant="secondary">
          Retry
        </Button>
      </div>
    </div>
  );
}
