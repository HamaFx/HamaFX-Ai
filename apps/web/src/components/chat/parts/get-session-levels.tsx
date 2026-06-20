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

// Bespoke renderer for the `get_session_levels` tool part.
//
// Three pill rows for asia / london / ny — open / high / low / close.
// Sessions still forming render with a soft "forming…" tag instead of a
// closing print.

import type { SessionRange, SessionTag } from '@hamafx/shared';

import type { ToolPartProps } from './registry';

const SESSION_LABEL: Record<SessionTag, string> = {
  asia: 'Asia',
  london: 'London',
  ny: 'NY',
};

export function GetSessionLevelsPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_session_levels'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  if (output.pipelinePending) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-lg border p-3 text-sm">
        No candles available yet for {output.symbol} — try again in a minute.
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">{output.symbol} · session levels</h3>
        <span className="text-fg-subtle font-mono text-caption">
          {new Date(output.asOf).toISOString().slice(11, 16)}Z
        </span>
      </header>

      <SessionList rows={output.today} title="Today" />
      {output.prior ? <SessionList rows={output.prior} title="Prior day" /> : null}
    </div>
  );
}

function SessionList({ rows, title }: { rows: SessionRange[]; title: string }) {
  return (
    <section>
      <h4 className="text-fg-subtle mb-1 text-body-sm uppercase tracking-wide">{title}</h4>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={`${r.session}-${r.fromMs}`}
            className="flex items-baseline justify-between gap-2 text-body-sm tabular-nums"
          >
            <span className="text-fg w-14 font-semibold">{SESSION_LABEL[r.session]}</span>
            <span className="text-fg-muted flex-1">
              O {fmt(r.open)} · H {fmt(r.high)} · L {fmt(r.low)} ·{' '}
              {r.forming ? <em className="text-warn not-italic">forming…</em> : `C ${fmt(r.close)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function fmt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toFixed(n > 100 ? 2 : 5);
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Computing session levels"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mt-3 h-20 animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Session levels failed{message ? ` · ${message}` : ''}
    </div>
  );
}
