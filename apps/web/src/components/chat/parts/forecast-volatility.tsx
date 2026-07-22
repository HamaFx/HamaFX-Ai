// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `forecast_volatility` tool part.
//
// One ATR pip readout, an expected forward move with optional event
// adjustment chip, and a projected range when the live mid is available.

import type { ToolPartProps } from './registry';

export function ForecastVolatilityPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'forecast_volatility'>) {
  if (state === 'error') return <ErrorCard message={errorMessage} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol} · {output.horizonHours}h forward vol
        </h3>
        {output.eventAdjusted ? (
          <span className="bg-warn/15 text-warn rounded-sm px-2 py-0.5 text-caption font-semibold">
            Event-adjusted ×{output.eventMultiplier.toFixed(1)}
          </span>
        ) : null}
      </header>

      <dl className="grid grid-cols-3 gap-2 text-body-sm tabular-nums">
        <Stat k={`ATR (${output.tf})`} v={`${output.atrPips.toFixed(1)} pips`} />
        <Stat
          k="ATR · 30d avg"
          v={
            output.atrPipsBaseline30d !== null
              ? `${output.atrPipsBaseline30d.toFixed(1)} pips`
              : '—'
          }
        />
        <Stat k="Expected move" v={`${output.expectedMovePips.toFixed(1)} pips`} />
      </dl>

      {output.expectedRange ? (
        <p className="text-fg text-sm tabular-nums">
          Range:{' '}
          <span className="text-fg-muted">
            {output.expectedRange.low.toFixed(5)} — {output.expectedRange.high.toFixed(5)}
          </span>{' '}
          (mid {output.expectedRange.mid.toFixed(5)})
        </p>
      ) : null}

      {output.nextHighImpact ? (
        <p className="text-fg-muted text-xs">
          Next high-impact: {output.nextHighImpact.title}
          {output.nextHighImpact.currency ? ` (${output.nextHighImpact.currency})` : ''} ·{' '}
          {output.nextHighImpact.whenIso}
        </p>
      ) : null}

      <p className="text-fg-muted text-xs">{output.notes}</p>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-divider flex flex-col rounded-sm border p-2">
      <span className="text-fg-subtle text-caption uppercase tracking-wide">{k}</span>
      <span className="text-fg font-semibold">{v}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Forecasting volatility"
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
      Vol forecast failed{message ? ` · ${message}` : ''}
    </div>
  );
}
