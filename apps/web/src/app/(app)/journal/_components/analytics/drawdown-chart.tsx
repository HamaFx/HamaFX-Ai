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

// Mini equity-curve chart with drawdown periods shaded below the running peak.

import type { JournalEntry, JournalStats } from '@hamafx/shared';
import { useMemo } from 'react';

import { cn } from '@/lib/cn';

interface DrawdownChartProps {
  entries: readonly JournalEntry[];
  stats: JournalStats;
  className?: string;
}

export function DrawdownChart({ entries, stats, className }: DrawdownChartProps) {
  const { curve, peaks, maxDrawdown, recoveryFactor } = useMemo(() => {
    const closed = [...entries]
      .filter((e) => e.outcome !== 'open' && e.rMultiple !== null)
      .sort((a, b) => a.openedAt - b.openedAt);

    const curve: number[] = [];
    const peaks: number[] = [];
    let cumulative = 0;
    let peak = 0;
    let maxDD = 0;

    for (const e of closed) {
      cumulative += e.rMultiple ?? 0;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDD) maxDD = dd;
      curve.push(cumulative);
      peaks.push(peak);
    }

    const recovery = maxDD === 0 ? 0 : stats.totalR / maxDD;
    return { curve, peaks, maxDrawdown: maxDD, recoveryFactor: recovery };
  }, [entries, stats.totalR]);

  if (curve.length < 2) {
    return (
      <div
        className={cn(
          'border border-zinc-800 bg-zinc-950 rounded-sm p-4 flex flex-col gap-2',
          className,
        )}
      >
        <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
          Drawdown
        </span>
        <p className="text-sm text-fg-muted">Not enough closed trades to show drawdown.</p>
      </div>
    );
  }

  const min = Math.min(...curve, 0);
  const max = Math.max(...curve, 1);
  const range = max - min || 1;
  const width = curve.length - 1;

  const linePath = curve
    .map((v, i) => {
      const x = (i / width) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  const peakPath = peaks
    .map((v, i) => {
      const x = (i / width) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <div
      className={cn(
        'border border-zinc-800 bg-zinc-950 rounded-sm p-4 flex flex-col gap-3',
        className,
      )}
      role="img"
      aria-label={`Drawdown chart: max drawdown ${maxDrawdown.toFixed(2)}R`}
    >
      <div className="flex items-center justify-between">
        <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
          Drawdown
        </span>
        <span className="text-caption text-fg-muted tabular-nums">
          Max DD: -{maxDrawdown.toFixed(2)}R · Recovery: {recoveryFactor.toFixed(2)}
        </span>
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full">
        {/* Drawdown shade: area between the peak line and the equity curve. */}
        <defs>
          <clipPath id="drawdown-clip">
            <path d={peakPath} />
          </clipPath>
        </defs>
        <path
          d={areaPath}
          className="fill-bear/20"
          clipPath="url(#drawdown-clip)"
        />
        <path
          d={linePath}
          fill="none"
          className="stroke-bull"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
