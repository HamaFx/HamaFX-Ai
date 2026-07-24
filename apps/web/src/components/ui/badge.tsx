// SPDX-License-Identifier: Apache-2.0

// <Badge> — shared status/role/severity pill. Replaces the repeated
// inline `cn('rounded-sm px-2 py-0.5 text-xs font-bold uppercase', ...)`
// pattern used across admin tabs, settings, and elsewhere.
//
// Tones map to existing design tokens:
//   success  → bg-success/10 text-success
//   danger   → bg-danger/10 text-danger
//   warn     → bg-warn/10 text-warn
//   brand    → bg-brand/10 text-brand
//   neutral  → bg-bg-elev-2 text-fg-muted

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'success' | 'danger' | 'warn' | 'brand' | 'neutral';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warn: 'bg-warn/10 text-warn',
  brand: 'bg-brand/10 text-brand',
  neutral: 'bg-bg-elev-2 text-fg-muted',
};

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-bold uppercase',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
