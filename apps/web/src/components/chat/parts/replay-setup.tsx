// Bespoke renderer for the `replay_setup` tool part.
//
// Headline win-rate + avg R, plus a tight scrollable trade table for the
// trades that fired in the window. Thin-sample warning when count < 5.

import type { ToolPartProps } from './registry';

export function ReplaySetupPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'replay_setup'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          Replay · {output.symbol} {output.tf}
        </h3>
        <span className="text-fg-subtle text-[10px]">{output.ruleLabel}</span>
      </header>

      <dl className="grid grid-cols-4 gap-2 text-[11px] tabular-nums">
        <Stat k="Trades" v={String(output.count)} />
        <Stat
          k="Win rate"
          v={`${(output.hitRate * 100).toFixed(0)}%`}
          tone={output.hitRate >= 0.5 ? 'text-bull' : 'text-bear'}
        />
        <Stat
          k="Avg R"
          v={output.avgR.toFixed(2)}
          tone={output.avgR > 0 ? 'text-bull' : 'text-bear'}
        />
        <Stat
          k="Total R"
          v={output.totalR.toFixed(2)}
          tone={output.totalR > 0 ? 'text-bull' : 'text-bear'}
        />
      </dl>

      {output.thin ? (
        <p
          role="note"
          className="text-warn border-warn/30 bg-warn/5 rounded-md border px-2 py-1 text-[11px]"
        >
          Thin sample — fewer than 5 trades. Treat as illustrative.
        </p>
      ) : null}

      {output.trades.length > 0 ? (
        <div className="text-[11px] tabular-nums">
          <div className="text-fg-subtle grid grid-cols-5 px-2 py-1 text-[10px] uppercase tracking-wide">
            <span>Side</span>
            <span>Entry</span>
            <span>Exit</span>
            <span>R</span>
            <span>Reason</span>
          </div>
          <ul className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
            {output.trades.slice(0, 25).map((t, i) => (
              <li key={i} className="border-divider/40 grid grid-cols-5 rounded-md border px-2 py-1">
                <span className={t.side === 'long' ? 'text-bull' : 'text-bear'}>
                  {t.side === 'long' ? '▲' : '▼'}
                </span>
                <span>{t.entry.toFixed(5)}</span>
                <span>{t.exit.toFixed(5)}</span>
                <span className={t.rMultiple >= 0 ? 'text-bull' : 'text-bear'}>
                  {t.rMultiple >= 0 ? '+' : ''}
                  {t.rMultiple.toFixed(2)}
                </span>
                <span className="text-fg-muted uppercase">{t.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-fg-muted text-xs">{output.notes}</p>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="border-divider/40 flex flex-col rounded-md border p-2">
      <span className="text-fg-subtle text-[10px] uppercase tracking-wide">{k}</span>
      <span className={`text-fg font-semibold ${tone ?? ''}`}>{v}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Replaying rule"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mt-3 h-32 animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Rule replay failed{message ? ` · ${message}` : ''}
    </div>
  );
}
