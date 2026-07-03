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

// <Tooltip> — minimal CSS-only tooltip primitive. We deliberately don't
// pull in Radix Tooltip here: it would add ~12KB gz for a single feature
// the entire codebase needs to be sprinkled with. The native `title`
// attribute fails focus-visible (only shown on hover), so we render a
// styled bubble that appears on both `hover` and `focus-within`.
//
// Behaviour:
//   - Pointer hover → bubble fades in after 350ms
//   - Keyboard focus on the trigger → bubble fades in immediately
//   - Touch devices → no hover state; the trigger should still have
//     `aria-label`, which screen readers read aloud
//   - prefers-reduced-motion → instant fade
//
// Usage:
//   <Tooltip label="Pause alert">
//     <button aria-label="Pause alert">…</button>
//   </Tooltip>

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface TooltipProps {
  /** Bubble text. Always provide an `aria-label` on the trigger to match. */
  label: string;
  /** Position relative to the trigger. Default 'top'. */
  side?: 'top' | 'bottom';
  /** Wrap a single interactive element (button/anchor). */
  children: ReactNode;
  className?: string;
}

export function Tooltip({ label, side = 'top', children, className }: TooltipProps) {
  return (
    <span
      className={cn('group/tooltip relative inline-flex items-center', className)}
    >
      {children}
      <span
        role="tooltip"
        // Bubble is a sibling of the trigger so the trigger keeps its own DOM
        // contract; we surface it via group-hover/focus-within. aria-hidden
        // because the trigger already has an accessible name.
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50',
          'whitespace-nowrap rounded-sm px-2 py-1 text-body-sm font-medium',
          'surface-elevated text-fg shadow-lg',
          'opacity-0 transition-opacity duration-150',
          'group-hover/tooltip:opacity-100 group-hover/tooltip:delay-300',
          'group-focus-within/tooltip:opacity-100 group-focus-within/tooltip:delay-0',
          side === 'top' ? '-top-9' : 'top-[calc(100%+6px)]',
        )}
      >
        {label}
      </span>
    </span>
  );
}
