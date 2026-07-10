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

// Bespoke renderer for the `get_correlation` tool part.
// Renders the correlation matrix dynamically with text-bull /
// text-bear cells and a small DXY proxy strip with the value and 24h
// change.

import {
  type CorrelationCell,
} from '@hamafx/shared';

import type { ToolPartProps } from './registry';

export function GetCorrelationPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_correlation'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  const lookup = new Map<string, CorrelationCell>();
  for (const c of output.matrix) {
    lookup.set(`${c.a}|${c.b}`, c);
    lookup.set(`${c.b}|${c.a}`, { a: c.b, b: c.a, r: c.r });
  }

  // Extract all unique symbols present in the matrix dynamically
  const uniqueSymbols = Array.from(
    new Set(output.matrix.flatMap((cell) => [cell.a, cell.b]))
  ).sort();

  if (uniqueSymbols.length === 0) {
    uniqueSymbols.push('XAUUSD', 'EURUSD', 'GBPUSD');
  }

  const dxy = output.dxyProxy;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          Correlation · {output.tf} · {output.windowBars} bars
        </h3>
        <span className="text-fg-subtle font-mono text-caption">
          {new Date(output.asOf).toISOString().slice(11, 16)}Z
        </span>
      </header>

      <div className="overflow-x-auto scrollbar-hide scroll-shadows-x">
        <table className="w-full border-separate border-spacing-1 text-body-sm tabular-nums">
          <thead>
            <tr>
              <th className="text-fg-subtle text-left font-medium pr-2" />
              {uniqueSymbols.map((s) => (
                <th key={s} className="text-fg-muted text-center font-semibold text-xs py-1 px-2 min-w-[60px]">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {uniqueSymbols.map((row) => (
              <tr key={row}>
                <td className="text-fg-muted text-left font-semibold text-xs py-1 px-2">{row}</td>
                {uniqueSymbols.map((col) => (
                  <td key={col} className="text-center py-1 px-2">
                    {row === col ? (
                      <span className="text-fg-subtle/40 font-mono">1.00</span>
                    ) : (
                      <Cell row={row} col={col} lookup={lookup} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phase 1.2d — correlation heat strip */}
      <HeatStrip matrix={output.matrix} />

      <section className="border-border border-t pt-2">
        <header className="flex items-baseline justify-between gap-2">
          <span className="text-fg text-xs font-semibold">DXY proxy</span>
          <span className={`text-body-sm tabular-nums ${dxy.change24h >= 0 ? 'text-bull' : 'text-bear'}`}>
            {dxy.value.toFixed(4)} ({dxy.change24h >= 0 ? '+' : ''}
            {dxy.change24h.toFixed(2)}% 24h)
          </span>
        </header>
        <p className="text-fg-subtle mt-1 font-mono text-caption">{dxy.formula}</p>
      </section>
    </div>
  );
}

function Cell({
  row,
  col,
  lookup,
}: {
  row: string;
  col: string;
  lookup: Map<string, CorrelationCell>;
}) {
  const cell = lookup.get(`${row}|${col}`);
  if (!cell) return <span className="text-fg-subtle">—</span>;
  const tone = cell.r >= 0.4 ? 'text-bull' : cell.r <= -0.4 ? 'text-bear' : 'text-fg-muted';
  return <span className={`${tone} font-semibold`}>{cell.r.toFixed(2)}</span>;
}

// Phase 1.2d — a single-row heat strip, one cell per matrix entry, coloured
// by correlation strength. Pure divs (server-renderable).
function HeatStrip({ matrix }: { matrix: CorrelationCell[] }) {
  if (matrix.length === 0) return null;

  const colorFor = (r: number) =>
    r >= 0.7
      ? 'bg-bull/80'
      : r >= 0.4
        ? 'bg-bull/40'
        : r <= -0.7
          ? 'bg-bear/80'
          : r <= -0.4
            ? 'bg-bear/40'
            : 'bg-bg-elev-3';

  // Strongest pair by |r| for the accessible label.
  const strongest = matrix.reduce((best, c) => (Math.abs(c.r) > Math.abs(best.r) ? c : best), matrix[0]!);
  const label = `Correlation heat strip: ${strongest.a}/${strongest.b} at ${strongest.r.toFixed(2)}`;

  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={label}>
      {matrix.map((c, i) => (
        <span key={`${c.a}-${c.b}-${i}`} className={`h-2 flex-1 rounded-sm ${colorFor(c.r)}`} />
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing correlation"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-20 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Correlation failed{message ? ` · ${message}` : ''}
    </div>
  );
}
