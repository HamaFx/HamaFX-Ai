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

// Premium stat card with solid surface and optional sparkline. Used by
// journal stats and any future numeric summary surface.
//
// Mobile-first: p-4 (16px) for comfortable thumb tap if/when the cards
// become interactive, gap-2 (8px) vertical rhythm on the 8-pt grid.
//
// Per PLAN.md §2.4 + §2.5 — solid bg-elev-1 surface (no surface-panel),
// R1 numeric scale for the value, R1 type tokens throughout.

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Sparkline } from './sparkline';

export type StatTone = 'fg' | 'bull' | 'bear' | 'muted' | 'warn';

export interface StatCardProps {
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

const TONE_TINT: Record<StatTone, string> = {
  fg: '',
  bull: 'border-l-emerald-500/40',
  bear: 'border-l-red-500/40',
  muted: '',
  warn: 'border-l-amber-500/40',
};

export function StatCard({ icon, label, value, tone = 'fg', sparkline }: StatCardProps) {
  return (
    <div
      aria-label={`${label}: ${value}`}
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-sm',
        'border border-zinc-800 border-l-2 bg-zinc-950 p-4',
        TONE_TINT[tone],
      )}
    >
      <div className="text-fg-subtle relative flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider">
        {icon ? (
          <span className={cn('inline-flex h-4 w-4 items-center justify-center', TONE_CLASS[tone])}>
            {icon}
          </span>
        ) : null}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'text-lg font-bold tabular-nums leading-none tracking-tight font-mono',
          TONE_CLASS[tone],
        )}
      >
        {value}
      </div>
      {sparkline && sparkline.length >= 2 ? (
        <Sparkline values={sparkline} label={label} className={cn('h-6 w-full opacity-70', TONE_CLASS[tone])} />
      ) : (
        <div className="h-6" />
      )}
    </div>
  );
}
