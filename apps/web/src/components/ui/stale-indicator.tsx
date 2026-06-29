'use client';

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
      role="alert"
      aria-live="polite"
      className={cn(
        'text-fg-subtle stale-pulse inline-flex items-center gap-1 text-xs font-medium tabular-nums uppercase tracking-wide',
        className,
      )}
    >
      <RefreshCw className="size-3 animate-spin" aria-hidden="true" />
      {label ?? 'updating'}
    </span>
  );
}
