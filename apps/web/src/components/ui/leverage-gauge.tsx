// SPDX-License-Identifier: Apache-2.0

// ASCII portfolio leverage gauge — flat horizontal text-based bar using
// JetBrains Mono block characters. Maps margin usage against configured
// thresholds with stateful coloring:
//
//   Under 50%   → muted gray  (text-fg-subtle)
//   50% – 80%   → brand-orange (text-brand)
//   Over 80%    → danger red   (text-danger animate-pulse)
//
// Displays 20 fixed-length character slots: █ for filled, ░ for empty.
//
// M1: Converted from client to server component — the inline computations
// are pure and don't require React hooks.

import { cn } from '@/lib/cn';

const SLOTS = 20;

function computeFilled(usagePct: number): number {
  const clamped = Math.max(0, Math.min(usagePct / 100, 1));
  return Math.round(clamped * SLOTS);
}

function computeTone(usagePct: number): string {
  if (usagePct > 80) return 'text-danger animate-pulse';
  if (usagePct >= 50) return 'text-brand';
  return 'text-fg-subtle';
}

interface LeverageGaugeProps {
  /** Current margin usage as a percentage (0–100+). */
  usagePct: number;
  /** Optional label, e.g. "Margin Used". */
  label?: string;
  /** Optional display value, e.g. "$12,450 / $50,000". */
  detail?: string;
}

export function LeverageGauge({ usagePct, label = 'Margin Used', detail }: LeverageGaugeProps) {
  const filled = computeFilled(usagePct);
  const empty = SLOTS - filled;
  const toneClass = computeTone(usagePct);

  return (
    <div className="flex flex-col gap-1.5 font-mono" aria-label={`${label}: ${usagePct.toFixed(1)}%`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-fg-subtle font-semibold uppercase tracking-wider">
          {label}
        </span>
        <span className={cn('text-caption font-bold tabular-nums', toneClass)}>
          {usagePct.toFixed(1)}%
        </span>
      </div>

      <div className="text-xs leading-none tracking-[0.08em] select-none" aria-hidden="true">
        <span className={cn(toneClass)}>
          {'█'.repeat(filled)}
        </span>
        <span className="text-fg-subtle/40">
          {'░'.repeat(empty)}
        </span>
      </div>

      {detail ? (
        <p className="text-caption text-fg-subtle/60 tabular-nums">{detail}</p>
      ) : null}
    </div>
  );
}
