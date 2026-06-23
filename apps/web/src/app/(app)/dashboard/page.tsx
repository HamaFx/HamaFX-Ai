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

import { listAlerts, listEntries, listUpcomingEvents } from '@hamafx/ai';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { TrendingUp, Activity, DollarSign, Clock } from 'lucide-react';

import { StatCard, type StatCardProps } from '@/components/ui/stat-card';
import { PerformanceChart } from '@/components/chart/performance-chart';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  const userId = session.user.id;

  // Fetch real data
  const [alerts, events, journalEntries] = await Promise.all([
    listAlerts(userId, { limit: 5 }),
    listUpcomingEvents({ limit: 5 }),
    listEntries(userId, { limit: 100 }),
  ]);

  const activeCount = journalEntries.filter((e) => e.outcome === 'open').length;
  const closed = journalEntries.filter((e) => e.outcome !== 'open');
  const totalR = closed.reduce((sum, e) => sum + (e.rMultiple ?? 0), 0);
  const winRate = closed.length > 0 ? (closed.filter((e) => e.outcome === 'win').length / closed.length) * 100 : 0;
  
  // Calculate average duration for closed trades
  let avgDurationStr = '—';
  const closedWithTimes = closed.filter((e) => e.closedAt && e.openedAt);
  if (closedWithTimes.length > 0) {
    const totalMs = closedWithTimes.reduce((sum, e) => sum + ((e.closedAt ?? 0) - e.openedAt), 0);
    const avgMs = totalMs / closedWithTimes.length;
    const avgMin = Math.round(avgMs / 60_000);
    if (avgMin < 60) {
      avgDurationStr = `${avgMin}m`;
    } else {
      const avgHrs = Math.floor(avgMin / 60);
      const remMin = avgMin % 60;
      avgDurationStr = remMin > 0 ? `${avgHrs}h ${remMin}m` : `${avgHrs}h`;
    }
  }

  // Calculate rolling R-multiples for the sparkline
  const closedSpark = closed.slice(0, 10).reverse();
  let cumulative = 0;
  const rSparkline = closedSpark.map((e) => {
    cumulative += e.rMultiple ?? 0;
    return cumulative;
  });

  const METRICS: StatCardProps[] = [
    {
      label: 'Cumulative R',
      value: `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`,
      tone: (totalR > 0 ? 'bull' : totalR < 0 ? 'bear' : 'fg') as 'bull' | 'bear' | 'fg',
      icon: <DollarSign />,
      ...(rSparkline.length > 1 ? { sparkline: rSparkline } : {}),
    },
    {
      label: 'Win Rate',
      value: `${winRate.toFixed(0)}%`,
      tone: (winRate >= 50 ? 'bull' : winRate > 0 ? 'muted' : 'bear') as 'bull' | 'bear' | 'muted',
      icon: <TrendingUp />,
    },
    {
      label: 'Active Positions',
      value: String(activeCount),
      tone: 'fg',
      icon: <Activity />,
    },
    {
      label: 'Avg Duration',
      value: avgDurationStr,
      tone: 'muted',
      icon: <Clock />,
    },
  ];

  return (
    <div className="flex flex-col gap-6 w-full @container">
      {/* Bento Grid layout using container queries for density */}
      <div className={cn(
        "grid gap-4",
        "grid-cols-2", // Default mobile
        "@3xl:grid-cols-4 @3xl:grid-rows-[auto_1fr]" // Desktop (dense)
      )}>
        {/* Metric Cards - Top Row */}
        {METRICS.map((metric, i) => (
          <div key={i} className="@3xl:col-span-1">
            <StatCard {...metric} />
          </div>
        ))}
        
        {/* Main Chart Area - Takes up more space */}
        <div className="col-span-2 @3xl:col-span-3 @3xl:row-span-2 min-h-[300px] @3xl:min-h-[400px]">
          <div className="card-premium h-full w-full flex flex-col p-4" style={{ contentVisibility: 'auto' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold tracking-tight">Performance Curve</h2>
              <span className="text-xs text-fg-muted">Cumulative R-Multiple</span>
            </div>
            <div className="flex-1">
              {closed.length === 0 ? (
                <div className="h-full flex items-center justify-center border border-divider/50 rounded-md bg-bg-elev-2/30">
                  <span className="text-fg-muted text-sm">No closed trades to display performance curve</span>
                </div>
              ) : (
                <PerformanceChart entries={journalEntries} height={320} />
              )}
            </div>
          </div>
        </div>
        
        {/* Side column: Alerts & Events */}
        <div className="col-span-2 @3xl:col-span-1 @3xl:row-span-2 flex flex-col gap-4">
          {/* Recent Logs Card */}
          <div className="card-premium flex flex-col p-4" style={{ contentVisibility: 'auto' }}>
            <h2 className="text-sm font-semibold tracking-tight mb-3">Recent Logs</h2>
            <div className="flex flex-col gap-2">
              {journalEntries.slice(0, 3).map((e) => (
                <div key={e.id} className="flex items-start gap-2.5 py-1.5 border-b border-divider/40 last:border-0">
                  <span className={cn(
                    "text-caption font-bold px-1.5 py-0.5 rounded uppercase shrink-0 mt-0.5",
                    e.side === 'long' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                  )}>
                    {e.side}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-body-sm font-semibold text-fg truncate">{e.symbol}</span>
                    <span className="text-caption text-fg-subtle">
                      {e.outcome === 'open' ? 'Open' : `Closed (${(e.rMultiple ?? 0) >= 0 ? '+' : ''}${(e.rMultiple ?? 0).toFixed(1)}R)`}
                    </span>
                  </div>
                </div>
              ))}
              {journalEntries.length === 0 && (
                <p className="text-caption text-fg-muted py-4 text-center">No trades logged yet</p>
              )}
            </div>
          </div>

          {/* Upcoming Macro Card */}
          <div className="card-premium flex flex-col p-4" style={{ contentVisibility: 'auto' }}>
            <h2 className="text-sm font-semibold tracking-tight mb-3">Upcoming Events</h2>
            <div className="flex flex-col gap-2">
              {events.slice(0, 3).map((e) => (
                <div key={e.id} className="flex flex-col gap-0.5 py-1.5 border-b border-divider/40 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-sm font-semibold text-fg truncate">{e.title}</span>
                    <span className={cn(
                      "text-caption font-bold px-1 rounded shrink-0",
                      e.importance === 'high' ? 'bg-bear/15 text-bear' : e.importance === 'medium' ? 'bg-warn/15 text-warn' : 'bg-fg-muted/15 text-fg-muted'
                    )}>
                      {e.currency ?? e.country}
                    </span>
                  </div>
                  <span className="text-caption text-fg-subtle">
                    {new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at{' '}
                    {new Date(e.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-caption text-fg-muted py-4 text-center">No upcoming events</p>
              )}
            </div>
          </div>

          {/* Active Alerts Card */}
          <div className="card-premium flex flex-col p-4" style={{ contentVisibility: 'auto' }}>
            <h2 className="text-sm font-semibold tracking-tight mb-3">Active Alerts</h2>
            <div className="flex flex-col gap-2">
              {alerts.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3 py-1.5 border-b border-divider/40 last:border-0">
                  <div className="flex flex-col min-w-0">
                    <span className="text-body-sm font-semibold text-fg truncate">{a.rule.symbol}</span>
                    <span className="text-caption text-fg-subtle truncate">
                      {a.rule.type === 'priceCross' ? `${a.rule.direction} ${a.rule.level}` : a.rule.type}
                    </span>
                  </div>
                  <span className={cn(
                    "text-caption font-bold px-1.5 py-0.5 rounded shrink-0",
                    a.active ? 'bg-bull/10 text-bull' : 'bg-fg-muted/10 text-fg-muted'
                  )}>
                    {a.active ? 'Armed' : 'Paused'}
                  </span>
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="text-caption text-fg-muted py-4 text-center">No alerts set</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
