/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// /settings/track-record — AI Track Record page.
// Shows the accuracy of AI decision signals: hit rate, per-model
// breakdown, per-horizon breakdown, and recent signals.

import { computeSignalStats } from '@hamafx/ai';
import type { SignalStats } from '@hamafx/shared';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import type { Metadata } from 'next';
import { Target, TrendingUp, TrendingDown } from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'AI Track Record' };
export const revalidate = 60;

export default async function TrackRecordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const stats = await computeSignalStats(session.user.id);

  return <TrackRecordContent stats={stats} />;
}

function TrackRecordContent({ stats }: { stats: SignalStats }) {
  if (stats.total === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold text-fg">AI Track Record</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            Every time the AI makes a directional recommendation, we track it and
            later evaluate whether it was correct against actual price movement.
          </p>
        </div>
        <EmptyState
          icon={<Target className="size-8" />}
          title="No signals yet"
          description="Ask the AI for a trade recommendation (buy/sell with entry, stop, and target) to start building a track record."
        />
      </div>
    );
  }

  const hitRatePct = (stats.hitRate * 100).toFixed(1);
  const avgReturnStr = stats.avgReturnPct >= 0 ? `+${stats.avgReturnPct.toFixed(2)}%` : `${stats.avgReturnPct.toFixed(2)}%`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-fg">AI Track Record</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Accountability through transparency — see how the AI&apos;s predictions perform.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Hit Rate" value={`${hitRatePct}%`} icon={Target} />
        <StatCard label="Total Signals" value={String(stats.total)} icon={Target} />
        <StatCard
          label="Avg Return"
          value={avgReturnStr}
          icon={stats.avgReturnPct >= 0 ? TrendingUp : TrendingDown}
          valueClass={stats.avgReturnPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
        />
        <StatCard label="Evaluated" value={String(stats.evaluated)} icon={Target} />
      </div>

      {/* Accuracy by Model */}
      {stats.byModel.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg mb-3">Accuracy by Model</h3>
          <div className="flex flex-col gap-2">
            {stats.byModel.map((m: { model: string; hitRate: number; count: number }) => (
              <div key={m.model} className="flex items-center gap-3">
                <span className="text-sm text-fg-subtle w-32 truncate">{m.model}</span>
                <div className="flex-1 h-6 bg-surface-elevated rounded overflow-hidden">
                  <div
                    className="h-full bg-brand rounded transition-all"
                    style={{ width: `${m.hitRate * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-fg w-12 text-right">
                  {(m.hitRate * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-fg-subtle w-10 text-right">({m.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accuracy by Horizon */}
      {stats.byHorizon.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg mb-3">Accuracy by Horizon</h3>
          <div className="flex flex-col gap-2">
            {stats.byHorizon.map((h: { horizon: string; hitRate: number; count: number }) => (
              <div key={h.horizon} className="flex items-center gap-3">
                <span className="text-sm text-fg-subtle w-20">{h.horizon}</span>
                <div className="flex-1 h-6 bg-surface-elevated rounded overflow-hidden">
                  <div
                    className="h-full bg-brand rounded transition-all"
                    style={{ width: `${h.hitRate * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-fg w-12 text-right">
                  {(h.hitRate * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-fg-subtle w-10 text-right">({h.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accuracy by Action */}
      {stats.byAction.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg mb-3">Accuracy by Action</h3>
          <div className="flex flex-col gap-2">
            {stats.byAction.map((a: { action: string; hitRate: number; count: number }) => (
              <div key={a.action} className="flex items-center gap-3">
                <span className="text-sm text-fg-subtle w-20 uppercase">{a.action}</span>
                <div className="flex-1 h-6 bg-surface-elevated rounded overflow-hidden">
                  <div
                    className="h-full bg-brand rounded transition-all"
                    style={{ width: `${a.hitRate * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-fg w-12 text-right">
                  {(a.hitRate * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-fg-subtle w-10 text-right">({a.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Signals */}
      {stats.recentSignals.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-fg mb-3">Recent Signals</h3>
          <div className="flex flex-col gap-2">
            {stats.recentSignals.map((s: { id: string; symbol: string; action: string; horizon: string; model: string | null; status: string }) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-fg">{s.symbol}</span>
                  <span
                    className={cn(
                      'text-xs font-medium px-2 py-0.5 rounded uppercase',
                      s.action === 'buy' || s.action === 'add'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : s.action === 'sell' || s.action === 'reduce'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                    )}
                  >
                    {s.action}
                  </span>
                  <span className="text-xs text-fg-subtle">{s.horizon}</span>
                  {s.model && (
                    <span className="text-xs text-fg-subtle hidden md:inline">
                      {s.model}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
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
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-fg-subtle">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn('mt-2 text-2xl font-bold text-fg', valueClass)}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    closed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    expired: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    invalidated: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded', styles[status] ?? styles.closed)}>
      {status}
    </span>
  );
}