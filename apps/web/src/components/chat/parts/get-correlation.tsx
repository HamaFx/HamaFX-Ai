// Bespoke renderer for the `get_correlation` tool part.
//
// Server component. Renders the 3×3 correlation matrix with text-bull /
// text-bear cells and a small DXY proxy strip with the value and 24h
// change. The formula is shown verbatim under the strip so the user can
// spot-check the math.

import {
  SYMBOLS,
  type CorrelationCell,
  type Symbol,
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

  const dxy = output.dxyProxy;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          Correlation · {output.tf} · {output.windowBars} bars
        </h3>
        <span className="text-fg-subtle font-mono text-[10px]">
          {new Date(output.asOf).toISOString().slice(11, 16)}Z
        </span>
      </header>

      <table className="w-full border-separate border-spacing-1 text-[11px] tabular-nums">
        <thead>
          <tr>
            <th className="text-fg-subtle text-left font-medium" />
            {SYMBOLS.map((s) => (
              <th key={s} className="text-fg-muted text-center font-medium">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SYMBOLS.map((row) => (
            <tr key={row}>
              <th className="text-fg-muted text-left font-medium">{row}</th>
              {SYMBOLS.map((col) => (
                <td key={col} className="text-center">
                  {row === col ? (
                    <span className="text-fg-subtle">·</span>
                  ) : (
                    <Cell row={row} col={col} lookup={lookup} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="border-border border-t pt-2">
        <header className="flex items-baseline justify-between gap-2">
          <span className="text-fg text-xs font-semibold">DXY proxy</span>
          <span className={`text-[11px] tabular-nums ${dxy.change24h >= 0 ? 'text-bull' : 'text-bear'}`}>
            {dxy.value.toFixed(4)} ({dxy.change24h >= 0 ? '+' : ''}
            {dxy.change24h.toFixed(2)}% 24h)
          </span>
        </header>
        <p className="text-fg-subtle mt-1 font-mono text-[10px]">{dxy.formula}</p>
      </section>
    </div>
  );
}

function Cell({
  row,
  col,
  lookup,
}: {
  row: Symbol;
  col: Symbol;
  lookup: Map<string, CorrelationCell>;
}) {
  const cell = lookup.get(`${row}|${col}`);
  if (!cell) return <span className="text-fg-subtle">—</span>;
  const tone = cell.r >= 0.4 ? 'text-bull' : cell.r <= -0.4 ? 'text-bear' : 'text-fg-muted';
  return <span className={`${tone} font-semibold`}>{cell.r.toFixed(2)}</span>;
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Computing correlation"
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
      Correlation failed{message ? ` · ${message}` : ''}
    </div>
  );
}
