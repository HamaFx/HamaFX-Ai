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

// <EmptyState> — shared empty/zero-data placeholder. Mobile-first vertical
// rhythm on the 8-pt grid:
//
//   icon container      80×80 (tone="brand") or 64×64 (tone="muted")
//   gap-5 (20px)        between icon and text block
//   gap-2 (8px)         inside text block (title → description)
//   gap-5 (20px)        between text block and action
//
// Tone:
//   brand → soft brand tint, used for "primary" empty states
//           (welcome, "log your first trade")
//   muted → neutral elev surface, used for "no data yet" states where the
//           absence is informational, not a call-to-action
//
// Per PLAN.md §2.4 + §2.5 — solid surface (no surface-panel), sharper radii
// (rounded-sm → rounded-sm), no glow shadow on the icon container.

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'brand' | 'muted';
  /** Render without the surrounding card chrome (in-flow). */
  bare?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'muted',
  bare,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-label={title}
      className={cn(
        'flex flex-col items-center gap-5 px-6 py-10 text-center',
        !bare && 'border border-border bg-bg-elev-1 rounded-sm',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center rounded-sm',
          tone === 'brand' ? 'text-fg bg-bg-elev-2 h-20 w-20' : 'text-fg-muted bg-bg-elev-2 h-16 w-16',
        )}
      >
        {icon}
      </span>
      <div className="flex max-w-xs flex-col gap-2">
        <p className="text-fg text-body font-semibold tracking-tight">{title}</p>
        {description ? (
          <p className="text-fg-muted text-body-sm leading-[1.4]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
