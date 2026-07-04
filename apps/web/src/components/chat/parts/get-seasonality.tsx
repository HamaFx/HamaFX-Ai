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

// Bespoke renderer for the `get_seasonality` tool part.
//
// Per-bucket median return + win rate + sample size, with a thin warning
// banner when fewer than 30 samples per bucket are available.

import type { ToolPartProps } from './registry';

export function GetSeasonalityPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_seasonality'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol} · seasonality · {output.granularity}
        </h3>
        <span className="text-fg-subtle text-caption">{output.sampleSize} samples</span>
      </header>

      {output.thin ? (
        <p
          role="note"
          className="text-warn border-warn/30 bg-warn/5 rounded-sm border px-2 py-1 text-body-sm"
        >
          Thin sample — interpret as directional, not statistically significant.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-1 text-body-sm tabular-nums sm:grid-cols-3">
        {output.buckets.map((b) => {
          const tone = b.medianReturnPct >= 0 ? 'text-bull' : 'text-bear';
          return (
            <li
              key={b.key}
              className="border-divider flex items-baseline justify-between gap-2 rounded-sm border px-2 py-1"
            >
              <span className="text-fg-muted w-12 font-medium">{b.label}</span>
              <span className={`${tone} font-semibold`}>
                {b.medianReturnPct >= 0 ? '+' : ''}
                {b.medianReturnPct.toFixed(2)}%
              </span>
              <span className="text-fg-subtle text-caption">
                {(b.winRate * 100).toFixed(0)}% win · n={b.count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing seasonality"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-24 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-sm border p-3 text-sm"
    >
      Seasonality failed{message ? ` · ${message}` : ''}
    </div>
  );
}
