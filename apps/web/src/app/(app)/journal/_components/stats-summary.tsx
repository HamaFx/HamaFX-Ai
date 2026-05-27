// Journal stats — 2×2 stat-card grid on mobile, 4 cols on desktop. Each
// card shows a sparkline of the last N entries' R-multiples so the trend
// is glanceable without scrolling the list.

import type { JournalEntry, JournalStats } from '@hamafx/shared';
import { Activity, Calculator, Target, TrendingUp } from 'lucide-react';

import { StatCard, type StatTone } from '@/components/ui/stat-card';

interface StatsSummaryProps {
  stats: JournalStats;
  /** Recent entries (newest first or last — we sort here). */
  entries?: readonly JournalEntry[];
}

export function StatsSummary({ stats, entries = [] }: StatsSummaryProps) {
  const winRatePct = (stats.winRate * 100).toFixed(0);

  // Sparkline values: rolling cumulative R-multiple over the last 20 closed entries.
  // We build the cumulative sum oldest-first so the line trends right.
  const closed = entries
    .filter((e): e is JournalEntry & { rMultiple: number } => e.rMultiple !== null && e.rMultiple !== undefined)
    .slice(0, 20)
    .reverse();

  let cumulative = 0;
  const cumR: number[] = [];
  for (const e of closed) {
    cumulative += e.rMultiple;
    cumR.push(cumulative);
  }

  // Win-rate rolling window: percentage of wins in the last N closed trades.
  const winRateSpark: number[] = [];
  for (let i = 1; i <= closed.length; i += 1) {
    const slice = closed.slice(0, i);
    const wins = slice.filter((e) => e.rMultiple > 0).length;
    winRateSpark.push((wins / slice.length) * 100);
  }

  const tradesSpark = closed.map((_, i) => i + 1);
  const avgRSpark = closed.map((e) => e.rMultiple);

  const avgRTone: StatTone = stats.avgR > 0.05 ? 'bull' : stats.avgR < -0.05 ? 'bear' : 'muted';
  const winTone: StatTone = stats.winRate >= 0.5 ? 'bull' : stats.winRate > 0 ? 'muted' : 'bear';
  const totalTone: StatTone = stats.totalR > 0 ? 'bull' : stats.totalR < 0 ? 'bear' : 'muted';

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        icon={<Activity className="size-3.5" strokeWidth={2} />}
        label="trades"
        value={stats.count}
        sparkline={tradesSpark}
      />
      <StatCard
        icon={<Target className="size-3.5" strokeWidth={2} />}
        label="win-rate"
        value={`${winRatePct}%`}
        tone={winTone}
        sparkline={winRateSpark}
      />
      <StatCard
        icon={<TrendingUp className="size-3.5" strokeWidth={2} />}
        label="avg R"
        value={stats.avgR.toFixed(2)}
        tone={avgRTone}
        sparkline={avgRSpark}
      />
      <StatCard
        icon={<Calculator className="size-3.5" strokeWidth={2} />}
        label="total R"
        value={stats.totalR.toFixed(2)}
        tone={totalTone}
        sparkline={cumR}
      />
    </dl>
  );
}
