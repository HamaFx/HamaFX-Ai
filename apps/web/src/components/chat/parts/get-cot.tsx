// Bespoke renderer for the `get_cot` tool part.
//
// Server component. Renders a compact strip of net-positioning samples
// over the last N weeks with .tabular-nums and text-bull / text-bear
// colouring. Empty pipeline → quiet status line.

import type { CoTSample } from '@hamafx/shared';

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
      <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
        <p className="text-fg-muted text-sm">{output.summary}</p>
      </div>
    );
  }

  if (output.samples.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
        <p className="text-fg-muted text-sm">No CoT data for {output.symbol} in window.</p>
      </div>
    );
  }

  const nets = output.samples.map(netRow);
  const max = Math.max(0.0001, ...nets.map((n) => Math.abs(n.leveraged ?? 0)));

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol} · CoT · {output.samples.length} weeks
        </h3>
      </header>

      <p className="text-fg-muted text-xs leading-snug">{output.summary}</p>

      <ul className="flex flex-col gap-1.5">
        {nets.map((row, i) => (
          <li key={row.dateIso} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px]">
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

      <p className="text-fg-subtle text-[10px]">Bars show leveraged-fund net positioning.</p>
    </div>
  );
}

function Bar({ value, max }: { value: number | null; max: number }) {
  if (value === null) return <span className="text-fg-subtle text-[10px]">—</span>;
  const pct = Math.max(2, Math.abs(value) / max * 100);
  const tone = value >= 0 ? 'bg-bull' : 'bg-bear';
  return <span className={`block h-1.5 rounded-full ${tone}`} style={{ width: `${pct}%` }} />;
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
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Loading CoT"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <ul className="mt-3 flex flex-col gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="bg-bg-elev-2 h-4 animate-pulse rounded" />
        ))}
      </ul>
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      CoT load failed{message ? ` · ${message}` : ''}
    </div>
  );
}
