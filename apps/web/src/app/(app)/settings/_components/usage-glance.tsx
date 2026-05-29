// Usage at a glance — shows today's spend + 7d/30d totals + a daily-budget
// gauge, with a deep-link to /settings/usage for the full breakdown.
// Server component.

import { computeUsage } from '@hamafx/ai';
import { ChevronRight } from 'lucide-react';
import { Link } from 'next-view-transitions';

import { getServerEnv } from '@/lib/env';
import { cn } from '@/lib/cn';

export async function UsageGlance() {
  let maxDailyUsd = 5;
  try {
    maxDailyUsd = getServerEnv().MAX_DAILY_USD;
  } catch {
    /* env not fully populated in dev */
  }

  let stats: Awaited<ReturnType<typeof computeUsage>> | null = null;
  try {
    stats = await computeUsage();
  } catch {
    return null;
  }

  const pct = Math.min(100, (stats.todayUsd / maxDailyUsd) * 100);
  const tone = pct >= 90 ? 'bear' : pct >= 60 ? 'warn' : 'bull';
  const toneClass = tone === 'bear' ? 'bg-bear' : tone === 'warn' ? 'bg-warn' : 'bg-bull';

  return (
    <Link
      href="/settings/usage"
      aria-label="Open detailed usage"
      className="card-premium group flex flex-col gap-3 p-4 transition-colors md:hover:bg-bg-elev-2/40"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-fg-subtle text-[10px] font-semibold uppercase tracking-wider">
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

      <dl className="grid grid-cols-3 gap-3 text-xs tabular-nums">
        <Stat label="Last 7d" value={`$${stats.sevenDayUsd.toFixed(4)}`} />
        <Stat label="Last 30d" value={`$${stats.thirtyDayUsd.toFixed(4)}`} />
        <Stat label="Turns 30d" value={String(stats.thirtyDayTurns)} />
      </dl>

      <div className="text-fg-muted flex items-center justify-between gap-2 text-xs font-medium">
        <span>View detailed breakdown</span>
        <ChevronRight className="text-fg-subtle size-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-fg-subtle text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="text-fg font-semibold">{value}</dd>
    </div>
  );
}
