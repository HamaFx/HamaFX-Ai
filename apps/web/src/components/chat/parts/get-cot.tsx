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

// Bespoke renderer for the `get_cot` tool part.
//
// Phase 1.2c — bars are now center-anchored (positive grows right, negative
// left) with a center zero-line and an animated width-on-mount entrance.
//
// Client component — uses motion for the bar entrance animation.

'use client';

import type { CoTSample } from '@hamafx/shared';
import { m } from 'motion/react';

import { cn } from '@/lib/cn';

import type { ToolPartProps } from './registry';

export function GetCoTPart({ output, state, errorMessage }: ToolPartProps<'get_cot'>) {
  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  if (output.pipelinePending) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">{output.summary}</p>
      </div>
    );
  }

  if (output.samples.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">No CoT data for {output.symbol} in window.</p>
      </div>
    );
  }

  const nets = output.samples.map(netRow);
  const max = Math.max(0.0001, ...nets.map((n) => Math.abs(n.leveraged ?? 0)));

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol} · CoT · {output.samples.length} weeks
        </h3>
      </header>

      <p className="text-fg-muted text-xs leading-snug">{output.summary}</p>

      <ul className="flex flex-col gap-1.5">
        {nets.map((row, i) => (
          <li key={row.dateIso} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-body-sm">
            <span className="text-fg-subtle w-16 tabular-nums">{row.dateIso.slice(5)}</span>
            <Bar value={row.leveraged} max={max} />
            <span
              className={`w-20 text-right tabular-nums ${row.leveraged === null ? 'text-fg-subtle' : row.leveraged >= 0 ? 'text-bull' : 'text-bear'}`}
            >
              {row.leveraged === null ? '—' : formatSigned(row.leveraged)}
            </span>
            {i === 0 ? null : null}
          </li>
        ))}
      </ul>

      <p className="text-fg-subtle text-caption">Bars show leveraged-fund net positioning.</p>
    </div>
  );
}

function Bar({ value, max }: { value: number | null; max: number }) {
  if (value === null) return <span className="text-fg-subtle text-caption">—</span>;
  // Center-anchored: positive grows right, negative grows left. Half-width
  // since each side has 50% of the track.
  const pct = Math.max(2, (Math.abs(value) / max) * 50);
  const positive = value >= 0;
  const tone = positive ? 'bg-bull' : 'bg-bear';
  return (
    <div className="relative h-[3px] w-full rounded-sm bg-bg-elev-2">
      {/* center zero-line */}
      <span aria-hidden className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-divider" />
      <m.div
        className={cn('absolute top-0 h-full rounded-sm', tone)}
        style={positive ? { left: '50%' } : { right: '50%' }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

interface NetRow {
  dateIso: string;
  leveraged: number | null;
}

function netRow(s: CoTSample): NetRow {
  const lev = s.leveragedLong !== null && s.leveragedShort !== null ? s.leveragedLong - s.leveragedShort : null;
  return {
    dateIso: new Date(s.reportDate).toISOString().slice(0, 10),
    leveraged: lev,
  };
}

function formatSigned(n: number): string {
  return n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Loading CoT"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <ul className="mt-3 flex flex-col gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="bg-bg-elev-2 h-4 animate-pulse rounded-sm" />
        ))}
      </ul>
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-sm border p-3 text-sm"
    >
      CoT load failed{message ? ` · ${message}` : ''}
    </div>
  );
}
