// Premium stat card with glass surface, gradient tone glow, and optional
// sparkline. Used by journal stats and any future numeric summary surface.

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Sparkline } from './sparkline';

export type StatTone = 'fg' | 'bull' | 'bear' | 'muted' | 'warn';

interface StatCardProps {
  /** Lucide icon (or any 14–16px ReactNode). */
  icon?: ReactNode;
  label: string;
  value: string | number;
  tone?: StatTone;
  /** Sparkline values (most-recent last). Hidden when < 2 points. */
  sparkline?: readonly number[];
}

const TONE_CLASS: Record<StatTone, string> = {
  fg: 'text-fg',
  bull: 'text-bull',
  bear: 'text-bear',
  muted: 'text-fg-muted',
  warn: 'text-warn',
};

const TONE_GLOW: Record<StatTone, string> = {
  fg: '',
  bull: 'before:bg-[radial-gradient(ellipse_at_top_right,oklch(74%_0.2_152/0.15),transparent_60%)]',
  bear: 'before:bg-[radial-gradient(ellipse_at_top_right,oklch(68%_0.24_25/0.15),transparent_60%)]',
  muted: '',
  warn: 'before:bg-[radial-gradient(ellipse_at_top_right,oklch(80%_0.16_80/0.15),transparent_60%)]',
};

export function StatCard({ icon, label, value, tone = 'fg', sparkline }: StatCardProps) {
  return (
    <div
      className={cn(
        'card-premium relative flex flex-col gap-2 overflow-hidden p-3.5',
        'before:pointer-events-none before:absolute before:inset-0 before:opacity-100',
        TONE_GLOW[tone],
      )}
    >
      <div className="text-fg-subtle relative flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
        {icon ? (
          <span className={cn('inline-flex h-4 w-4 items-center justify-center', TONE_CLASS[tone])}>
            {icon}
          </span>
        ) : null}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'text-2xl font-bold tabular-nums leading-none tracking-tight',
          TONE_CLASS[tone],
        )}
      >
        {value}
      </div>
      {sparkline && sparkline.length >= 2 ? (
        <Sparkline values={sparkline} className={cn('h-5 w-full opacity-70', TONE_CLASS[tone])} />
      ) : (
        <div className="h-5" />
      )}
    </div>
  );
}
