'use client';

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

// Upgraded Stats Summary Dashboard with advanced risk analytics.
// Displays core metrics, a horizontal segmented trade distribution gauge,
// and institutional stats (Profit Factor, Max Drawdown, Expectancy, and Extreme trade boundaries).

import type { JournalEntry, JournalStats } from '@hamafx/shared';
import {
  Activity,
  Calculator,
  Target,
  TrendingUp,
  ShieldAlert,
  Percent,
  Award,
  TrendingDown,
  Flame,
  Clock,
  CalendarDays,
  BookOpen,
} from 'lucide-react';
import { useMemo } from 'react';

import { StatCard, type StatTone } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

interface StatsSummaryProps {
  stats: JournalStats;
  entries?: readonly JournalEntry[];
}

export function StatsSummary({ stats, entries = [] }: StatsSummaryProps) {
  const winRatePct = (stats.winRate * 100).toFixed(0);

  // 1. Calculate historical closed trades
  const closedTrades = useMemo(() => {
    return entries.filter(
      (e) => e.rMultiple !== null && e.rMultiple !== undefined && e.outcome !== 'open'
    );
  }, [entries]);



  // 2. Sparkline values: rolling cumulative R-multiple over the last 20 closed entries.
  const closedSpark = useMemo(() => {
    return entries
      .filter((e): e is JournalEntry & { rMultiple: number } => e.rMultiple !== null && e.rMultiple !== undefined)
      .slice(0, 20)
      .reverse();
  }, [entries]);

  const cumR = useMemo(() => {
    let cumulative = 0;
    const res: number[] = [];
    for (const e of closedSpark) {
      cumulative += e.rMultiple;
      res.push(cumulative);
    }
    return res;
  }, [closedSpark]);

  // Win-rate rolling window sparkline
  const winRateSpark = useMemo(() => {
    const res: number[] = [];
    for (let i = 1; i <= closedSpark.length; i += 1) {
      const slice = closedSpark.slice(0, i);
      const wins = slice.filter((e) => e.rMultiple > 0).length;
      res.push((wins / slice.length) * 100);
    }
    return res;
  }, [closedSpark]);

  const tradesSpark = useMemo(() => closedSpark.map((_, i) => i + 1), [closedSpark]);
  const avgRSpark = useMemo(() => closedSpark.map((e) => e.rMultiple), [closedSpark]);

  // 3. Compute Advanced Institutional Metrics
  const grossProfit = useMemo(() => {
    return closedTrades
      .filter((e) => e.rMultiple! > 0)
      .reduce((sum, e) => sum + e.rMultiple!, 0);
  }, [closedTrades]);

  const grossLoss = useMemo(() => {
    return Math.abs(
      closedTrades
        .filter((e) => e.rMultiple! < 0)
        .reduce((sum, e) => sum + e.rMultiple!, 0)
    );
  }, [closedTrades]);

  const profitFactor = useMemo(() => {
    if (grossLoss === 0) return grossProfit > 0 ? 99.9 : 1.0;
    return grossProfit / grossLoss;
  }, [grossProfit, grossLoss]);

  const maxDrawdown = useMemo(() => {
    let peak = 0;
    let maxDD = 0;
    let currentSum = 0;

    // Process oldest to newest
    const sorted = [...closedTrades].sort((a, b) => a.openedAt - b.openedAt);
    sorted.forEach((e) => {
      currentSum += e.rMultiple ?? 0;
      if (currentSum > peak) {
        peak = currentSum;
      }
      const dd = peak - currentSum;
      if (dd > maxDD) {
        maxDD = dd;
      }
    });
    return maxDD;
  }, [closedTrades]);

  const extremes = useMemo(() => {
    const rValues = closedTrades.map((e) => e.rMultiple ?? 0);
    if (rValues.length === 0) return { best: 0, worst: 0 };
    return {
      best: Math.max(...rValues),
      worst: Math.min(...rValues),
    };
  }, [closedTrades]);

  // 4. Outcomes Distribution Calculations
  const distribution = useMemo(() => {
    const total = entries.length;
    if (total === 0) {
      return {
        win: 0,
        loss: 0,
        be: 0,
        open: 0,
        raw: { win: 0, loss: 0, be: 0, open: 0 },
      };
    }

    const win = entries.filter((e) => e.outcome === 'win').length;
    const loss = entries.filter((e) => e.outcome === 'loss').length;
    const be = entries.filter((e) => e.outcome === 'breakeven').length;
    const open = entries.filter((e) => e.outcome === 'open').length;

    return {
      win: (win / total) * 100,
      loss: (loss / total) * 100,
      be: (be / total) * 100,
      open: (open / total) * 100,
      raw: { win, loss, be, open },
    };
  }, [entries]);

  const avgRTone: StatTone = stats.avgR > 0.05 ? 'bull' : stats.avgR < -0.05 ? 'bear' : 'muted';
  const winTone: StatTone = stats.winRate >= 0.5 ? 'bull' : stats.winRate > 0 ? 'muted' : 'bear';
  const totalTone: StatTone = stats.totalR > 0 ? 'bull' : stats.totalR < 0 ? 'bear' : 'muted';
  if (entries.length === 0) {
    return (
      <div className="border border-divider bg-bg-elev-1 rounded-lg p-6">
        <EmptyState
          tone="muted"
          icon={<BookOpen className="size-7" strokeWidth={1.75} />}
          title="No journal entries yet"
          description="Start logging your trades to see statistics here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Visual Outcome Distribution Bar */}
      {entries.length > 0 && (
        <div className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-fg-subtle">
            <span className="uppercase tracking-wider">Outcome Distribution</span>
            <span className="tabular-nums text-fg-muted">{entries.length} Total Trades logged</span>
          </div>

          <div className="h-3 w-full rounded-full bg-bg-elev-3 overflow-hidden flex">
            {distribution.win > 0 && (
              <div
                style={{ width: `${distribution.win}%` }}
                className="h-full bg-bull transition-all duration-300"
                title={`Wins: ${distribution.raw.win}`}
              />
            )}
            {distribution.open > 0 && (
              <div
                style={{ width: `${distribution.open}%` }}
                className="h-full bg-brand transition-all duration-300 animate-pulse"
                title={`Open: ${distribution.raw.open}`}
              />
            )}
            {distribution.be > 0 && (
              <div
                style={{ width: `${distribution.be}%` }}
                className="h-full bg-fg-muted/65 transition-all duration-300"
                title={`Breakeven: ${distribution.raw.be}`}
              />
            )}
            {distribution.loss > 0 && (
              <div
                style={{ width: `${distribution.loss}%` }}
                className="h-full bg-bear transition-all duration-300"
                title={`Losses: ${distribution.raw.loss}`}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-0.5 text-caption font-semibold text-fg-subtle">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-bull" />
              <span>Wins ({distribution.raw.win})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-brand" />
              <span>Open ({distribution.raw.open})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-fg-muted/65" />
              <span>Breakeven ({distribution.raw.be})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-bear" />
              <span>Losses ({distribution.raw.loss})</span>
            </div>
          </div>
        </div>
      )}

      {/* Grid of Stat Cards */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
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

      {/* Advanced Institutional Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
        {/* Profit Factor */}
        <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-1 relative overflow-hidden group hover:border-brand/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Profit Factor</span>
            <Percent className="size-3.5 text-brand/70" />
          </div>
          <p className={cn(
            'text-lg font-bold tracking-tight mt-1.5 tabular-nums',
            profitFactor >= 1.5 ? 'text-bull' : profitFactor >= 1.0 ? 'text-fg' : 'text-bear'
          )}>
            {profitFactor.toFixed(2)}
          </p>
          <span className="text-[9px] text-fg-muted font-medium">Gross Wins vs. Gross Losses</span>
        </div>

        {/* Max Drawdown */}
        <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-1 relative overflow-hidden group hover:border-bear/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Max R DD</span>
            <ShieldAlert className="size-3.5 text-bear/70" />
          </div>
          <p className="text-lg font-bold tracking-tight mt-1.5 text-bear tabular-nums">
            -{maxDrawdown.toFixed(2)}R
          </p>
          <span className="text-[9px] text-fg-muted font-medium">Maximum peak-to-trough drop</span>
        </div>

        {/* Best Trade Win */}
        <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-1 relative overflow-hidden group hover:border-bull/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Best Trade</span>
            <Award className="size-3.5 text-bull/70" />
          </div>
          <p className="text-lg font-bold tracking-tight mt-1.5 text-bull tabular-nums">
            +{extremes.best.toFixed(2)}R
          </p>
          <span className="text-[9px] text-fg-muted font-medium">Single maximum R realized</span>
        </div>

        {/* Worst Trade Loss */}
        <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-1 relative overflow-hidden group hover:border-bear/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Worst Trade</span>
            <TrendingDown className="size-3.5 text-bear/70" />
          </div>
          <p className="text-lg font-bold tracking-tight mt-1.5 text-bear/80 tabular-nums">
            {extremes.worst.toFixed(2)}R
          </p>
          <span className="text-[9px] text-fg-muted font-medium">Single maximum R loss</span>
        </div>
      </div>

      {/* Phase B — UX_UPGRADE_PLAN.md item 13. Extended stats
          surface. Three new tiles + a per-day-of-week bar chart.
          All values are pre-computed by the server-side
          summarize() so we don't have to re-derive them here. */}
      {hasExtendedStats(stats) ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Win Streak</span>
                <Flame className="size-3.5 text-bull/70" />
              </div>
              <p className="text-lg font-bold tracking-tight mt-1.5 text-bull tabular-nums">
                {stats.longestWinStreak}
              </p>
              <span className="text-[9px] text-fg-muted font-medium">Longest consecutive wins (across breakevens)</span>
            </div>

            <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Loss Streak</span>
                <Flame className="size-3.5 text-bear/70" />
              </div>
              <p className="text-lg font-bold tracking-tight mt-1.5 text-bear/80 tabular-nums">
                {stats.longestLossStreak}
              </p>
              <span className="text-[9px] text-fg-muted font-medium">Longest consecutive losses</span>
            </div>

            <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Avg Hold</span>
                <Clock className="size-3.5 text-info/70" />
              </div>
              <p className="text-lg font-bold tracking-tight mt-1.5 text-fg tabular-nums">
                {(stats.avgHoldMs ?? 0) > 0 ? formatHoldTime(stats.avgHoldMs!) : '—'}
              </p>
              <span className="text-[9px] text-fg-muted font-medium">Average trade duration (closed)</span>
            </div>
          </div>

          {stats.perDayOfWeek ? (
            <div className="border border-divider bg-bg-elev-1 rounded-lg p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-3.5 text-fg-muted" />
                  <span className="text-caption font-bold uppercase tracking-wider text-fg-subtle">
                    Closed by day of week
                  </span>
                </div>
                <span className="text-caption text-fg-subtle tabular-nums">
                  {Object.values(stats.perDayOfWeek).reduce((a, b) => a + b, 0)} trades
                </span>
              </div>
              <DayOfWeekChart perDayOfWeek={stats.perDayOfWeek} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Phase B — UX_UPGRADE_PLAN.md item 13.
 * The extended stats are optional on the schema (for backward
 * compat with data persisted before item 13). We check for the
 * presence of the marker field so the new tiles only render when
 * the server actually computed them.
 */
function hasExtendedStats(stats: JournalStats): boolean {
  return (
    stats.maxDrawdown !== undefined ||
    stats.longestWinStreak !== undefined ||
    stats.profitFactor !== undefined
  );
}

/**
 * 7-bar monochrome bar chart. Height proportional to the max
 * weekday so the busiest day fills the row. Each bar is labelled
 * with the 3-letter day abbreviation and the count.
 */
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
type DowKey = keyof JournalStats['perDayOfWeek'] extends never
  ? 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
  : NonNullable<JournalStats['perDayOfWeek']> extends Record<infer K, number>
    ? K & string
    : string;
const DOW_KEYS: DowKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function DayOfWeekChart({
  perDayOfWeek,
}: {
  perDayOfWeek: NonNullable<JournalStats['perDayOfWeek']>;
}) {
  const counts = DOW_KEYS.map((k) => perDayOfWeek[k] ?? 0);
  const max = Math.max(1, ...counts); // avoid div-by-zero
  return (
    <div className="flex items-end gap-2 h-16">
      {counts.map((n, i) => {
        const heightPct = (n / max) * 100;
        return (
          <div key={DOW_KEYS[i]} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-fg-subtle text-[10px] tabular-nums">{n}</span>
            <div className="bg-bg-elev-2 flex h-full w-full items-end overflow-hidden rounded">
              <div
                className="bg-brand w-full"
                style={{ height: `${heightPct}%`, minHeight: n > 0 ? '4px' : '0' }}
                aria-label={`${DOW_LABELS[i]}: ${n}`}
              />
            </div>
            <span className="text-fg-muted text-[10px] uppercase tracking-wider">
              {DOW_LABELS[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatHoldTime(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}
