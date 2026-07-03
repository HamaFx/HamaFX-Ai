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

// Histogram of R-multiple buckets. Positive buckets are bullish, negative bearish.

import type { JournalStats } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface RDistributionProps {
  stats: JournalStats;
  className?: string;
}

export function RDistribution({ stats, className }: RDistributionProps) {
  const data = stats.rDistribution ?? [];
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div
      className={cn(
        'border border-zinc-800 bg-zinc-950 rounded-sm p-4 flex flex-col gap-3',
        className,
      )}
      role="img"
      aria-label="R-multiple distribution histogram"
    >
      <div className="flex items-center justify-between">
        <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
          R Distribution
        </span>
        <span className="text-caption text-fg-muted tabular-nums">{total} trades</span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-fg-muted">No closed trades to display.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-1 h-32">
            {data.map((d) => {
              const isPositive = d.bucket.startsWith('(') || d.bucket.startsWith('[') && d.bucket !== '[0,0]' && d.bucket !== '[-3,-2)' && d.bucket !== '[-2,-1)' && d.bucket !== '[-1,0)';
              const heightPct = (d.count / maxCount) * 100;
              return (
                <div key={d.bucket} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-fg-subtle text-xs tabular-nums">{d.count}</span>
                  <div
                    className={cn(
                      'w-full rounded-t',
                      isPositive ? 'bg-bull/60' : 'bg-bear/60',
                    )}
                    style={{ height: `${Math.max(heightPct, 0)}%` }}
                    aria-label={`${d.bucket}: ${d.count}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-8 gap-1">
            {data.map((d) => (
              <span
                key={`label-${d.bucket}`}
                className="text-caption text-fg-subtle tabular-nums text-center"
              >
                {d.bucket}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
