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

// Current and max win/loss streak pills.

import type { JournalStats } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface StreakDisplayProps {
  stats: JournalStats;
  className?: string;
}

export function StreakDisplay({ stats, className }: StreakDisplayProps) {
  const current = stats.currentStreak ?? { type: 'none', count: 0 };
  const maxWin = stats.maxWinStreak ?? 0;
  const maxLoss = stats.maxLossStreak ?? 0;

  const currentLabel = current.type === 'win' ? 'W' : current.type === 'loss' ? 'L' : '—';
  const currentClass =
    current.type === 'win'
      ? 'bg-emerald-500/10 text-emerald-500'
      : current.type === 'loss'
        ? 'bg-red-500/10 text-red-500'
        : 'bg-zinc-900 text-fg-muted';

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      <div
        className={cn(
          'border border-zinc-800 rounded-sm p-3 flex flex-col gap-1',
          currentClass,
        )}
      >
        <span className="text-caption font-bold uppercase tracking-wider opacity-80">Current</span>
        <span className="text-lg font-bold tabular-nums">
          {current.count}
          {currentLabel}
        </span>
      </div>

      <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-3 flex flex-col gap-1 text-emerald-500">
        <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Best Win</span>
        <span className="text-lg font-bold tabular-nums">{maxWin}</span>
      </div>

      <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-3 flex flex-col gap-1 text-red-500">
        <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Worst Loss</span>
        <span className="text-lg font-bold tabular-nums">{maxLoss}</span>
      </div>
    </div>
  );
}
