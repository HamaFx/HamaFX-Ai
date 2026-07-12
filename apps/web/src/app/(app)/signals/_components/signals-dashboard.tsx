'use client';

import type { DecisionSignal, SignalStats } from '@hamafx/shared';
import { memo, useState } from 'react';
import {IconTarget, IconTrendingUp, IconTrendingDown, IconChevronDown, IconChevronRight, IconBolt} from '@tabler/icons-react';

import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
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
        icon={<IconTarget className="size-8" />}
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
        <StatCard label="Total signals" value={String(stats.total)} icon={IconTarget} />
        <StatCard label="Hit rate" value={`${hitRatePct}%`} icon={IconTarget} />
        <StatCard
          label="Avg return"
          value={avgReturnStr}
          icon={stats.avgReturnPct >= 0 ? IconTrendingUp : IconTrendingDown}
          valueClass={stats.avgReturnPct >= 0 ? 'text-bull' : 'text-bear'}
        />
        <StatCard label="Evaluated" value={String(stats.evaluated)} icon={IconTarget} />
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

const SignalCard = memo(function SignalCard({ signal }: { signal: DecisionSignal }) {
  const [expanded, setExpanded] = useState(false);

  const biasToken = signal.bias === 'bullish' ? 'text-bull' : signal.bias === 'bearish' ? 'text-bear' : 'text-fg-muted';

  const statusStyles: Record<string, string> = {
    active: 'bg-info/10 text-info',
    pending: 'bg-warn/10 text-warn',
    hit: 'bg-bull/10 text-bull',
    miss: 'bg-bear/10 text-bear',
    expired: 'bg-bg-elev-2 text-fg-muted',
    invalidated: 'bg-bear/10 text-bear',
  };

  const statusLabel = signal.status.charAt(0).toUpperCase() + signal.status.slice(1);

  const metadata = signal.metadata as Record<string, unknown> | null;
  const reasoning = metadata?.reasoning as string | undefined;

  return (
    <div className="border border-border bg-bg-elev-1 rounded-sm p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-fg font-semibold text-sm">{signal.symbol}</span>
          <span className={cn('text-caption font-bold uppercase', biasToken)}>
            {signal.bias}
          </span>
          <span className={cn('text-caption font-medium px-1.5 py-0.5 rounded-sm', statusStyles[signal.status] ?? '')}>
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
            <span className="text-fg-subtle">Target</span>
            <span className="text-fg font-medium">{signal.takeProfit}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-fg-subtle text-caption">
          <span>{formatRelative(signal.anchorAt)}</span>
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
            <IconBolt className="size-3" />
            Reasoning
            {expanded ? <IconChevronDown className="size-3" /> : <IconChevronRight className="size-3" />}
          </button>
        )}
      </div>

      {expanded && reasoning && (
        <div className="border-t border-border pt-2 text-xs text-fg-muted leading-[1.4]">
          {reasoning}
        </div>
      )}
    </div>
  );
});

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
    <div className="rounded-sm border border-border bg-bg-elev-1 p-4">
      <div className="flex items-center gap-2 text-fg-subtle">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn('mt-2 text-2xl font-bold text-fg', valueClass)}>{value}</p>
    </div>
  );
}
