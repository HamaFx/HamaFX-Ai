'use client';

// <StaleIndicator> — distinguishes "loaded but background-refetching" from
// "fresh" or "loading from scratch." Steering rule §6 requires every page
// to define loading/empty/error/STALE states — this is the stale state.
//
// Use as a pill next to a timestamp or a header. Renders nothing when
// neither `isStale` nor `isFetching` are true.

import { RefreshCw } from 'lucide-react';

import { cn } from '@/lib/cn';

interface StaleIndicatorProps {
  /** True when the query is refetching in the background. */
  isFetching: boolean;
  /** Optional override label. Default 'updating' / 'stale'. */
  label?: string;
  className?: string;
}

export function StaleIndicator({ isFetching, label, className }: StaleIndicatorProps) {
  if (!isFetching) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'text-fg-subtle stale-pulse inline-flex items-center gap-1 text-[10px] font-medium tabular-nums uppercase tracking-wide',
        className,
      )}
    >
      <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
      {label ?? 'updating'}
    </span>
  );
}
