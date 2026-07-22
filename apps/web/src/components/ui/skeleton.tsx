// SPDX-License-Identifier: Apache-2.0

// <Skeleton> — single placeholder primitive. All loading.tsx files and
// in-component placeholders should use this so the loading aesthetic stays
// consistent across the app. Uses the `.shimmer` CSS animation defined in
// globals.css (which gracefully degrades under prefers-reduced-motion).

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...rest }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className={cn('shimmer rounded-sm', className)}
      {...rest}
    />
  );
}

interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Approximate row count (h-3 lines). */
  lines?: number;
}

/** Shimmering card placeholder matching the codebase's `surface-panel`. */
export function SkeletonCard({ className, lines = 2, ...rest }: SkeletonCardProps) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className={cn(
        'border-border bg-bg-elev-1/60 flex flex-col gap-2 overflow-hidden rounded-sm border p-4 fade-in',
        className,
      )}
      {...rest}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: `${100 - i * 18}%` }}
        />
      ))}
    </div>
  );
}
