// /settings/usage — token spend, daily-budget gauge, model breakdown,
// recent turns. Server component: pulls everything from the DB in one
// pass per render. Personal-mode volume keeps the query trivial.

import { computeUsage, listTelemetry, type DayBucket, type UsageStats } from '@hamafx/ai';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/cn';
import { getServerEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Usage' };
export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  // Pull env synchronously — if it's missing we still want to render the
  // shell so the user sees what's been recorded so far.
  let maxDailyUsd = 5;
  try {
    maxDailyUsd = getServerEnv().MAX_DAILY_USD;
  } catch {
    /* ignore — env may not be fully populated in dev */
  }

  const [stats, recent] = await Promise.all([computeUsage(), listTelemetry(20)]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Usage" description="AI cost and token spend over the last 30 days." />

      <BudgetCard stats={stats} maxDailyUsd={maxDailyUsd} />

      <DailyChart daily7={stats.daily7} />

      <ModelBreakdownCard stats={stats} />

      <RecentTurnsCard rows={recent} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's spend + daily-budget gauge
// ---------------------------------------------------------------------------

function BudgetCard({ stats, maxDailyUsd }: { stats: UsageStats; maxDailyUsd: number }) {
  const pct = Math.min(100, (stats.todayUsd / maxDailyUsd) * 100);
  const tone = pct >= 90 ? 'bear' : pct >= 60 ? 'warn' : 'bull';
  const toneClass = tone === 'bear' ? 'bg-bear' : tone === 'warn' ? 'bg-warn' : 'bg-bull';

  return (
    <section
      aria-labelledby="usage-budget-heading"
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="usage-budget-heading" className="text-fg-muted text-sm font-medium">
          Today (UTC)
        </h2>
        <span className="text-fg-subtle text-xs tabular-nums">
          ${stats.todayUsd.toFixed(4)} / ${maxDailyUsd.toFixed(2)}
        </span>
      </header>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Daily budget consumed"
        className="bg-bg-elev-2 h-2 w-full overflow-hidden rounded-full"
      >
        <div className={cn('h-full transition-all', toneClass)} style={{ width: `${pct}%` }} />
      </div>
      <dl className="grid grid-cols-3 gap-3 pt-1 text-xs tabular-nums">
        <Stat label="last 7d" value={`$${stats.sevenDayUsd.toFixed(4)}`} />
        <Stat label="last 30d" value={`$${stats.thirtyDayUsd.toFixed(4)}`} />
        <Stat label="turns" value={stats.thirtyDayTurns} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-fg-subtle text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="text-fg font-semibold">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily chart — text-based bars, no extra deps. Tabular numerals so columns
// line up. Empty days render a 1px line so they're visible but tiny.
// ---------------------------------------------------------------------------

function DailyChart({ daily7 }: { daily7: DayBucket[] }) {
  const max = Math.max(0.0001, ...daily7.map((d) => d.costUsd));

  return (
    <section
      aria-labelledby="usage-daily-heading"
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="usage-daily-heading" className="text-fg-muted text-sm font-medium">
        Last 7 days
      </h2>
      <ul className="flex flex-col gap-1.5">
        {daily7.map((d) => {
          const pct = Math.max(1, (d.costUsd / max) * 100);
          return (
            <li
              key={d.date}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px]"
            >
              <span className="text-fg-subtle w-12 tabular-nums">{shortDate(d.date)}</span>
              <span
                className="bg-brand block h-1.5 rounded-full"
                style={{ width: `${pct}%` }}
                aria-label={`${d.turns} turns, $${d.costUsd.toFixed(4)} spent`}
              />
              <span className="text-fg-muted w-20 text-right tabular-nums">
                ${d.costUsd.toFixed(4)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Per-model breakdown
// ---------------------------------------------------------------------------

function ModelBreakdownCard({ stats }: { stats: UsageStats }) {
  if (stats.byModel.length === 0) {
    return (
      <section
        aria-labelledby="usage-models-heading"
        className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-lg border p-4"
      >
        <h2 id="usage-models-heading" className="text-fg-muted text-sm font-medium">
          By model (30d)
        </h2>
        <p className="text-fg-subtle text-xs">No turns recorded yet.</p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="usage-models-heading"
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="usage-models-heading" className="text-fg-muted text-sm font-medium">
        By model (30d)
      </h2>
      <ul className="flex flex-col gap-1.5">
        {stats.byModel.map((m) => (
          <li
            key={m.model}
            className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 text-xs tabular-nums"
          >
            <span className="text-fg truncate font-mono text-[11px]">{m.model}</span>
            <span className="text-fg-subtle">{m.turns} turns</span>
            <span className="text-fg-subtle">
              {(m.inputTokens + m.outputTokens).toLocaleString()} tok
            </span>
            <span className="text-fg w-16 text-right">${m.costUsd.toFixed(4)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recent turns
// ---------------------------------------------------------------------------

function RecentTurnsCard({ rows }: { rows: Awaited<ReturnType<typeof listTelemetry>> }) {
  if (rows.length === 0) {
    return (
      <section
        aria-labelledby="usage-recent-heading"
        className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-lg border p-4"
      >
        <h2 id="usage-recent-heading" className="text-fg-muted text-sm font-medium">
          Recent turns
        </h2>
        <p className="text-fg-subtle text-xs">
          Nothing yet — start a conversation in <code>/chat</code>.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="usage-recent-heading"
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="usage-recent-heading" className="text-fg-muted text-sm font-medium">
        Recent turns
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="grid grid-cols-[1fr_auto] items-baseline gap-3 text-xs tabular-nums"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-fg truncate font-mono text-[11px]">{r.model}</span>
              <span className="text-fg-subtle text-[10px]">
                {formatRelative(r.createdAt)} · {r.inputTokens}/{r.outputTokens} tok · {r.toolCalls}{' '}
                tools · {Math.round(r.ms / 100) / 10}s
              </span>
            </div>
            <span className="text-fg w-16 text-right">${r.estCostUsd.toFixed(4)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
