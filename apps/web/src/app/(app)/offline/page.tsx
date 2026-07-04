'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-static';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <section className="flex min-h-[60svh] flex-col items-center justify-center gap-6 text-center px-4">
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-sm"
        style={{
          background: 'none',
          boxShadow: '0 0 24px -4px rgba(250, 250, 250, 0.15)',
        }}
      >
        <span className="text-black text-2xl font-bold">H</span>
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-fg text-xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-fg-muted text-sm max-w-sm">
          No connection to the market feed. Cached pages and features will continue to work while offline.
        </p>
      </div>
      <Button onClick={handleRetry} className="gap-2">
        <RotateCw className="h-4 w-4" />
        Retry Connection
      </Button>
    </section>
  );
}
