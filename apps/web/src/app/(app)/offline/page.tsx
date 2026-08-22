'use client';

import { useEffect, useState } from 'react';
import { IconRefresh, IconWifiOff } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { cn } from '@/lib/cn';

export const dynamic = 'force-static';

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      window.location.reload();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    window.location.reload();
  };

  return (
    <section className="flex min-h-[60svh] flex-col items-center justify-center gap-6 text-center px-4">
      <div className="size-16 rounded-full bg-bg-elev-2 flex items-center justify-center text-fg-subtle border border-border">
        <IconWifiOff className="size-8" />
      </div>
      <KestrelBrand variant="lockup" decorative className="w-32" />
      <div className="flex flex-col gap-2">
        <h1 className="text-fg text-xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-fg-muted text-sm max-w-sm">
          No connection to the market feed. Cached pages and features will continue to work while offline.
        </p>
      </div>
      <Button onClick={handleRetry} disabled={retrying} className="gap-2">
        <IconRefresh className={cn('h-4 w-4', retrying && 'animate-spin')} />
        {retrying ? 'Reconnecting...' : 'Retry Connection'}
      </Button>
    </section>
  );
}
