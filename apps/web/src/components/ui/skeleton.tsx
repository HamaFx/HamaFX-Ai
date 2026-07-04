/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
        'border-border bg-bg-elev-1/60 flex flex-col gap-2 overflow-hidden rounded-sm border p-4',
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
