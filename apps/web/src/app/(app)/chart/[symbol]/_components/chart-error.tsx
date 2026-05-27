'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface ChartErrorProps {
  error: Error;
  onRetry: () => void;
}

export function ChartError({ error, onRetry }: ChartErrorProps) {
  const isQuota = /quota|throttle|rate.?limit/i.test(error.message);

  return (
    <div className="aspect-[16/9] w-full md:aspect-[21/9]">
      <EmptyState
        tone="muted"
        icon={<AlertCircle className="text-bear size-7" strokeWidth={2} />}
        title={isQuota ? 'Rate limited' : 'Failed to load chart'}
        description={error.message.slice(0, 140)}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw className="size-4" /> Retry
          </Button>
        }
        className="h-full justify-center"
      />
    </div>
  );
}
