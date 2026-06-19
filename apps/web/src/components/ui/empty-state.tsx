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
//   brand → soft amber/violet gradient, used for "primary" empty states
//           (welcome, "log your first trade")
//   muted → neutral elev surface, used for "no data yet" states where the
//           absence is informational, not a call-to-action
//
// Wrap inside `card-premium` if the surrounding page benefits from card
// chrome; for in-flow placeholders pass `bare` to drop the card.

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
      className={cn(
        'flex flex-col items-center gap-5 px-6 py-10 text-center',
        !bare && 'card-premium',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center rounded-3xl',
          tone === 'brand' ? 'text-brand h-20 w-20' : 'text-fg-muted h-16 w-16',
        )}
        style={
          tone === 'brand'
            ? {
                backgroundImage: 'var(--gradient-brand-soft)',
                boxShadow:
                  'inset 0 1px 0 0 oklch(100% 0 0 / 0.1), 0 0 40px -8px oklch(78% 0.16 78 / 0.4)',
              }
            : {
                background: 'oklch(70% 0.02 265 / 0.1)',
                boxShadow: 'var(--shadow-inset-edge-soft)',
              }
        }
      >
        {icon}
      </span>
      <div className="flex max-w-xs flex-col gap-2">
        <p className="text-fg text-base font-semibold tracking-tight">{title}</p>
        {description ? (
          <p className="text-fg-muted text-sm leading-relaxed">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
