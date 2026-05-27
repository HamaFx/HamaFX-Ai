// Stat card with optional sparkline. Used by the journal stats grid and
// any future numeric summary surface.

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

export function StatCard({ icon, label, value, tone = 'fg', sparkline }: StatCardProps) {
  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-1.5 rounded-lg border p-3">
      <div className="text-fg-subtle flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide">
        {icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div className={cn('text-lg font-semibold tabular-nums leading-tight', TONE_CLASS[tone])}>
        {value}
      </div>
      {sparkline && sparkline.length >= 2 ? (
        <Sparkline values={sparkline} className={cn('h-4 w-full opacity-60', TONE_CLASS[tone])} />
      ) : null}
    </div>
  );
}
