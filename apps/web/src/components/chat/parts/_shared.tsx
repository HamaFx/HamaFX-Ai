// SPDX-License-Identifier: Apache-2.0

// Shared skeleton and error card components for chat tool parts (CC-10).
// Import from here instead of redefining per-file SkeletonCard/ErrorCard.

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

export interface SharedSkeletonCardProps {
  /** Accessible label for the loading state. */
  label?: string;
  /** Number of shimmering row placeholders. Defaults to 3. */
  rows?: number;
  /** Extra class on the wrapper. */
  className?: string;
}

/**
 * Skeleton card for chat tool parts. Shows a shimmering placeholder
 * with configurable row count and an aria-busy label.
 */
export function PartSkeletonCard({ label = 'Loading', rows = 3, className }: SharedSkeletonCardProps) {
  return (
    <div
      className={cn('border-border bg-bg-elev-1 rounded-sm border p-3', className)}
      aria-busy="true"
      aria-label={label}
    >
      <Skeleton className="h-4 w-1/2" />
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-3"
            style={{ width: `${100 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export interface SharedErrorCardProps {
  /** Error message to display. */
  message?: string;
  /** Prefix label shown before the message. Defaults to "Tool failed". */
  label?: string;
}

/**
 * Error card for chat tool parts. Shown when a tool call fails.
 */
export function PartErrorCard({ message, label = 'Tool failed' }: SharedErrorCardProps) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      {label}{message ? ` · ${message}` : ''}
    </div>
  );
}
