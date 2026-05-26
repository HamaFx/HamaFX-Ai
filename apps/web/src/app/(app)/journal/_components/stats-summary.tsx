import type { JournalStats } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface StatsSummaryProps {
  stats: JournalStats;
}

export function StatsSummary({ stats }: StatsSummaryProps) {
  const winRatePct = (stats.winRate * 100).toFixed(0);
  return (
    <dl className="border-border bg-bg-elev-1 grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-4">
      <Stat label="trades" value={stats.count} />
      <Stat
        label="win-rate"
        value={`${winRatePct}%`}
        tone={stats.winRate >= 0.5 ? 'bull' : stats.winRate > 0 ? 'muted' : 'bear'}
      />
      <Stat
        label="avg R"
        value={stats.avgR.toFixed(2)}
        tone={stats.avgR > 0.05 ? 'bull' : stats.avgR < -0.05 ? 'bear' : 'muted'}
      />
      <Stat
        label="total R"
        value={stats.totalR.toFixed(2)}
        tone={stats.totalR > 0 ? 'bull' : stats.totalR < 0 ? 'bear' : 'muted'}
      />
    </dl>
  );
}

function Stat({
  label,
  value,
  tone = 'fg',
}: {
  label: string;
  value: string | number;
  tone?: 'fg' | 'bull' | 'bear' | 'muted';
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-fg-subtle text-[10px] uppercase tracking-wide">{label}</dt>
      <dd
        className={cn(
          'text-base font-semibold tabular-nums',
          tone === 'bull' && 'text-bull',
          tone === 'bear' && 'text-bear',
          tone === 'muted' && 'text-fg-muted',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
