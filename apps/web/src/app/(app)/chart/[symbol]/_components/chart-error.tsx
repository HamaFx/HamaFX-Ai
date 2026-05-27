'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ChartErrorProps {
  error: Error;
  onRetry: () => void;
}

export function ChartError({ error, onRetry }: ChartErrorProps) {
  const isQuota = /quota|throttle|rate.?limit/i.test(error.message);

  return (
    <div className="card-premium flex aspect-[16/9] w-full flex-col items-center justify-center gap-3.5 p-6 md:aspect-[21/9]">
      <span
        className="text-bear inline-flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: 'oklch(68% 0.24 25 / 0.15)' }}
      >
        <AlertCircle className="size-6" strokeWidth={2} />
      </span>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-fg text-sm font-semibold">
          {isQuota ? 'Rate limited' : 'Failed to load chart'}
        </p>
        <p className="text-fg-muted max-w-xs text-xs">{error.message.slice(0, 140)}</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw className="size-3.5" /> Retry
      </Button>
    </div>
  );
}
