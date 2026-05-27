// Bespoke renderer for the `compute_risk` tool part.
//
// Position-sizing card. Three rows of dense, copy-friendly numbers — the
// trader's actual ticket-fill checklist — plus a one-line summary the
// agent can echo verbatim.

import type { ToolPartProps } from './registry';

export function ComputeRiskPart({ output, state, errorMessage }: ToolPartProps<'compute_risk'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  const tone = output.invalidDirection ? 'border-warn/40' : 'border-border';

  return (
    <div className={`bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-3 ${tone}`}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.side === 'long' ? 'Long' : 'Short'} {output.symbol} · risk{' '}
          {pretty(output.riskUsd, 2)} USD
        </h3>
        {output.rrRatio !== null ? (
          <span
            className={`text-[11px] tabular-nums ${output.rrRatio >= 1 ? 'text-bull' : 'text-bear'}`}
          >
            RR {output.rrRatio.toFixed(2)}
          </span>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Row k="Entry" v={pretty(output.entry, 5)} />
        <Row k="Stop" v={pretty(output.stop, 5)} />
        <Row k="Pips to stop" v={`${pretty(output.pipsToStop, 1)}`} />
        <Row
          k="Pips to target"
          v={output.pipsToTarget !== null ? pretty(output.pipsToTarget, 1) : '—'}
        />
        <Row k="Size (lots)" v={pretty(output.positionSizeLots, 2)} />
        <Row k="Size (units)" v={pretty(Math.round(output.positionSizeUnits), 0)} />
        <Row k="Pip $/lot" v={`$${pretty(output.pipValueUsdPerLot, 2)}`} />
        <Row
          k="Reward"
          v={output.rewardUsd !== null ? `$${pretty(output.rewardUsd, 2)}` : '—'}
        />
      </dl>

      <p className="text-fg-muted text-xs">{output.summary}</p>

      {output.invalidDirection ? (
        <p
          role="alert"
          className="text-warn border-warn/30 bg-warn/5 rounded-md border px-2 py-1 text-[11px]"
        >
          Stop is on the wrong side of entry for this direction — the agent suggested an inverted
          setup.
        </p>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-divider/50 pb-1">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="text-fg font-medium tabular-nums">{v}</dd>
    </div>
  );
}

function pretty(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Computing position size"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mt-3 h-24 animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Risk calc failed{message ? ` · ${message}` : ''}
    </div>
  );
}
