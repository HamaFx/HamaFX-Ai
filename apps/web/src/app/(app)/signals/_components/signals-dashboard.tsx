'use client';

import type { DecisionSignal, SignalStats } from '@hamafx/shared';
import { useState } from 'react';
import { Target, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';
import { SignalFeedback } from '@/app/(app)/settings/track-record/_components/signal-feedback';

import { EmptyState } from '@/components/ui/empty-state';

interface SignalsDashboardProps {
  signals: DecisionSignal[];
  stats: SignalStats;
}

export function SignalsDashboard({ signals, stats }: SignalsDashboardProps) {
  if (stats.total === 0) {
    return (
      <EmptyState
        icon={<Target className="size-8" />}
        title="No signals yet"
        description="Ask the AI for a trade recommendation to start building a track record."
      />
    );
  }

  const hitRatePct = (stats.hitRate * 100).toFixed(1);
  const avgReturnStr = stats.avgReturnPct >= 0 ? `+${stats.avgReturnPct.toFixed(2)}%` : `${stats.avgReturnPct.toFixed(2)}%`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total signals" value={String(stats.total)} icon={Target} />
        <StatCard label="Hit rate" value={`${hitRatePct}%`} icon={Target} />
        <StatCard
          label="Avg return"
          value={avgReturnStr}
          icon={stats.avgReturnPct >= 0 ? TrendingUp : TrendingDown}
          valueClass={stats.avgReturnPct >= 0 ? 'text-emerald-500' : 'text-red-500'}
        />
        <StatCard label="Evaluated" value={String(stats.evaluated)} icon={Target} />
      </div>

      {signals.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-fg">Recent Signals</h3>
          {signals.map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: DecisionSignal }) {
  const [expanded, setExpanded] = useState(false);

  const biasToken = signal.bias === 'bullish' ? 'text-emerald-500' : signal.bias === 'bearish' ? 'text-red-500' : 'text-fg-muted';

  const statusStyles: Record<string, string> = {
    active: 'bg-blue-500/10 text-blue-500',
    pending: 'bg-amber-500/10 text-amber-500',
    hit: 'bg-emerald-500/10 text-emerald-500',
    miss: 'bg-red-500/10 text-red-500',
    expired: 'bg-zinc-900 text-fg-muted',
    invalidated: 'bg-red-500/10 text-red-500',
  };

  const statusLabel = signal.status.charAt(0).toUpperCase() + signal.status.slice(1);

  function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.round(diff / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    return `${day}d ago`;
  }

  const metadata = signal.metadata as Record<string, unknown> | null;
  const reasoning = metadata?.reasoning as string | undefined;

  return (
    <div className="border border-zinc-800 bg-zinc-950 rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-fg font-semibold text-sm">{signal.symbol}</span>
          <span className={cn('text-caption font-bold uppercase', biasToken)}>
            {signal.bias}
          </span>
          <span className={cn('text-caption font-medium px-1.5 py-0.5 rounded', statusStyles[signal.status] ?? '')}>
            {statusLabel}
          </span>
        </div>
        <SignalFeedback signalId={signal.id} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
        <div>
          <span className="text-fg-subtle">Anchor </span>
          <span className="text-fg font-medium">{signal.anchorPrice}</span>
        </div>
        {signal.stopLoss !== null && (
          <div>
            <span className="text-fg-subtle">Stop </span>
            <span className="text-fg font-medium">{signal.stopLoss}</span>
          </div>
        )}
        {signal.takeProfit !== null && (
          <div>
            <span className="text-fg-subtle">Target </span>
            <span className="text-fg font-medium">{signal.takeProfit}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-fg-subtle text-caption">
          <span>{relativeTime(signal.anchorAt)}</span>
          {signal.horizon && <span>· {signal.horizon}</span>}
          {signal.model && <span>· {signal.model}</span>}
        </div>
        {reasoning && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-fg-subtle hover:text-fg text-caption transition-colors cursor-pointer"
            aria-expanded={expanded}
            aria-label="Toggle reasoning"
          >
            <Sparkles className="size-3" />
            Reasoning
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        )}
      </div>

      {expanded && reasoning && (
        <div className="border-t border-zinc-800 pt-2 text-xs text-fg-muted leading-[1.4]">
          {reasoning}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  valueClass?: string;
}) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-2 text-fg-subtle">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn('mt-2 text-2xl font-bold text-fg', valueClass)}>{value}</p>
    </div>
  );
}
