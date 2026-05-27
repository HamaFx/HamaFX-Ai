'use client';

import { Button } from '@/components/ui/button';

interface ChartErrorProps {
  error: Error;
  onRetry: () => void;
}

export function ChartError({ error, onRetry }: ChartErrorProps) {
  const isQuota = /quota|throttle|rate.?limit/i.test(error.message);

  return (
    <div className="border-border bg-bg-elev-1 flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 rounded-lg border md:aspect-[21/9]">
      <p className="text-bear text-sm font-medium">
        {isQuota ? 'Rate limited — retrying shortly' : 'Failed to load chart data'}
      </p>
      <p className="text-fg-subtle max-w-xs text-center text-xs">{error.message.slice(0, 120)}</p>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
