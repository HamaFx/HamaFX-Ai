'use client';

import { IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { KestrelBrand } from '@/components/brand/kestrel-brand';

export const dynamic = 'force-static';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <section className="flex min-h-[60svh] flex-col items-center justify-center gap-6 text-center px-4">
      <KestrelBrand variant="lockup" decorative className="w-32" />
      <div className="flex flex-col gap-2">
        <h1 className="text-fg text-xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-fg-muted text-sm max-w-sm">
          No connection to the market feed. Cached pages and features will continue to work while offline.
        </p>
      </div>
      <Button onClick={handleRetry} className="gap-2">
        <IconRefresh className="h-4 w-4" />
        Retry Connection
      </Button>
    </section>
  );
}
