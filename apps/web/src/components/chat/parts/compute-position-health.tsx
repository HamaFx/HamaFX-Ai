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

// Bespoke renderer for the `compute_position_health` tool part.
//
// One row per open journal entry: pnl in pips + R, distance to stop /
// target, and an "about to hit" chip when ≤ 5 pips out. Empty state when
// no positions are open.

import { Link } from 'next-view-transitions';

import type { ToolPartProps } from './registry';

export function ComputePositionHealthPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'compute_position_health'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  if (output.empty) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-sm border p-3 text-sm">
        No open trades in the journal.
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-sm border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">Open positions</h3>
        <span className="text-fg-subtle font-mono text-caption">
          {new Date(output.asOf).toISOString().slice(11, 16)}Z
        </span>
      </header>

      <ul className="flex flex-col gap-1">
        {output.rows.map((r) => {
          const pnlTone =
            r.pnlPips > 0 ? 'text-bull' : r.pnlPips < 0 ? 'text-bear' : 'text-fg-muted';
          return (
            <li
              key={r.entryId}
              className="border-divider flex flex-col gap-0.5 rounded-sm border p-2 text-body-sm tabular-nums"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-fg font-semibold">
                  {r.side === 'long' ? '▲ Long' : '▼ Short'} {r.symbol}
                </span>
                <span className={pnlTone}>
                  {r.pnlPips >= 0 ? '+' : ''}
                  {r.pnlPips.toFixed(1)} pips
                  {r.pnlR !== null
                    ? ` · ${r.pnlR >= 0 ? '+' : ''}${r.pnlR.toFixed(2)}R`
                    : ''}
                </span>
              </div>
              <div className="text-fg-muted flex flex-wrap gap-x-3">
                <span>entry {r.entry.toFixed(5)}</span>
                <span>mid {r.currentMid.toFixed(5)}</span>
                {r.distanceToStopPips !== null ? (
                  <span>stop {r.distanceToStopPips.toFixed(1)}p away</span>
                ) : null}
                {r.distanceToTargetPips !== null ? (
                  <span>target {r.distanceToTargetPips.toFixed(1)}p away</span>
                ) : null}
                {r.aboutToHit ? (
                  <span className="bg-warn/15 text-warn rounded-sm px-2 py-0.5 font-semibold">
                    About to hit
                  </span>
                ) : null}
                <Link
                  href={`/journal?id=${encodeURIComponent(r.entryId)}`}
                  className="text-fg ml-auto inline-flex hover:underline"
                >
                  open →
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {output.partial ? (
        <p
          role="note"
          className="text-warn border-warn/30 bg-warn/5 rounded-sm border px-2 py-1 text-body-sm"
        >
          One or more positions skipped due to a price-fetch failure.
        </p>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing position health"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-16 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Position health failed{message ? ` · ${message}` : ''}
    </div>
  );
}
