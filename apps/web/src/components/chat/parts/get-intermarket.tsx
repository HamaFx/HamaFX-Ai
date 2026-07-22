// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `get_intermarket` tool part.
//
// Top strip: regime tag + DXY proxy + gold pulse. Below: XAU/DXY
// correlation with a regime-break flag when it inverts. Notes at the
// bottom restate the deterministic interpretation in one line.

import type { RiskRegime } from '@hamafx/shared';

import type { ToolPartProps } from './registry';

const REGIME_TONE: Record<RiskRegime, { bg: string; fg: string; label: string }> = {
  'risk-on': { bg: 'bg-bull/15', fg: 'text-bull', label: 'Risk-on' },
  'risk-off': { bg: 'bg-bear/15', fg: 'text-bear', label: 'Risk-off' },
  neutral: { bg: 'bg-bg-elev-2', fg: 'text-fg-muted', label: 'Neutral' },
};

export function GetIntermarketPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_intermarket'>) {
  if (state === 'error') return <ErrorCard message={errorMessage} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  const tone = REGIME_TONE[output.regime];
  const dxyTone = output.dxyProxy.change24h >= 0 ? 'text-bull' : 'text-bear';
  const goldTone =
    output.goldChange24h === null
      ? 'text-fg-muted'
      : output.goldChange24h >= 0
        ? 'text-bull'
        : 'text-bear';

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">Intermarket · {output.tf}</h3>
        <span
          className={`rounded-sm px-2 py-0.5 text-caption font-semibold ${tone.bg} ${tone.fg}`}
        >
          {tone.label}
          {output.regimeBreak ? ' · regime break' : ''}
        </span>
      </header>

      <dl className="grid grid-cols-3 gap-2 text-body-sm tabular-nums">
        <Stat
          k="DXY proxy"
          v={output.dxyProxy.value.toFixed(4)}
          sub={`${output.dxyProxy.change24h >= 0 ? '+' : ''}${output.dxyProxy.change24h.toFixed(2)}% 24h`}
          tone={dxyTone}
        />
        <Stat
          k="Gold 24h"
          v={
            output.goldChange24h !== null
              ? `${output.goldChange24h >= 0 ? '+' : ''}${output.goldChange24h.toFixed(2)}%`
              : '—'
          }
          tone={goldTone}
        />
        <Stat
          k="XAU↔DXY corr"
          v={output.xauDxyCorrelation.toFixed(2)}
          tone={
            output.xauDxyCorrelation <= -0.4
              ? 'text-bull'
              : output.xauDxyCorrelation >= 0.4
                ? 'text-bear'
                : 'text-fg-muted'
          }
        />
      </dl>

      <p className="text-fg-muted text-xs">{output.notes}</p>
      <p className="text-fg-subtle font-mono text-caption">{output.dxyProxy.formula}</p>
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="border-divider flex flex-col rounded-sm border p-2">
      <span className="text-fg-subtle text-caption uppercase tracking-wide">{k}</span>
      <span className={`text-fg font-semibold ${tone ?? ''}`}>{v}</span>
      {sub ? <span className="text-fg-subtle text-caption">{sub}</span> : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing intermarket pulse"
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
      Intermarket failed{message ? ` · ${message}` : ''}
    </div>
  );
}
