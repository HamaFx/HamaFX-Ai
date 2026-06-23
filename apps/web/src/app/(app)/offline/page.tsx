'use client';

import { WifiOff, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-static';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <section className="flex min-h-[60svh] flex-col items-center justify-center gap-4 text-center px-4">
      <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
        <WifiOff className="text-muted-foreground h-6 w-6" />
      </div>
      <div className="space-y-2">
        <h1 className="text-fg text-xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-fg-muted text-sm max-w-sm">
          Please check your network connection. Cached pages and features will continue to work while offline.
        </p>
      </div>
      <Button onClick={handleRetry} className="mt-2 gap-2">
        <RotateCw className="h-4 w-4" />
        Retry Connection
      </Button>
    </section>
  );
}
