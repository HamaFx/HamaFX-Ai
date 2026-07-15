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

// ASCII portfolio leverage gauge — flat horizontal text-based bar using
// JetBrains Mono block characters. Maps margin usage against configured
// thresholds with stateful coloring:
//
//   Under 50%   → muted gray  (text-fg-subtle)
//   50% – 80%   → brand-orange (text-brand)
//   Over 80%    → danger red   (text-danger animate-pulse)
//
// Displays 20 fixed-length character slots: █ for filled, ░ for empty.

'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/cn';

const SLOTS = 20;

interface LeverageGaugeProps {
  /** Current margin usage as a percentage (0–100+). */
  usagePct: number;
  /** Optional label, e.g. "Margin Used". */
  label?: string;
  /** Optional display value, e.g. "$12,450 / $50,000". */
  detail?: string;
}

export function LeverageGauge({ usagePct, label = 'Margin Used', detail }: LeverageGaugeProps) {
  const filled = useMemo(() => {
    const clamped = Math.max(0, Math.min(usagePct / 100, 1));
    return Math.round(clamped * SLOTS);
  }, [usagePct]);

  const empty = SLOTS - filled;

  const toneClass = useMemo(() => {
    if (usagePct > 80) return 'text-danger animate-pulse';
    if (usagePct >= 50) return 'text-brand';
    return 'text-fg-subtle';
  }, [usagePct]);

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
