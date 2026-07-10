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

// Wires the form (in a Drawer), list, stats summary, and performance curve together.
// Implements an advanced, responsive two-column grid on desktop, showing the equity curve and list
// on the left, and stats summary / analytics on the right.

import type { JournalEntry, JournalStats } from '@hamafx/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {IconPlus, IconBook, IconActivity, IconRefresh} from '@tabler/icons-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Segmented } from '@/components/ui/segmented';
import { StaleIndicator } from '@/components/ui/stale-indicator';
import { PerformanceChart } from '@/components/chart/performance-chart';

import { BreakdownTable } from './analytics/breakdown-table';
import { DrawdownChart } from './analytics/drawdown-chart';
import { RDistribution } from './analytics/r-distribution';
import { StreakDisplay } from './analytics/streak-display';
import { AiReviewPanel } from './ai-review-panel';
import { EntryForm } from './entry-form';
import { EntryList } from './entry-list';
import { StatsSummary } from './stats-summary';

const QKEY = ['journal'] as const;

interface JournalResponse {
  entries: JournalEntry[];
  stats: JournalStats;
}

export function JournalView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'overview' | 'analytics' | 'trades'>('overview');
  const { data, isLoading, isFetching, isError, error } = useQuery<JournalResponse>({
    queryKey: QKEY,
    queryFn: async () => {
      const res = await fetch('/api/journal');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as JournalResponse;
    },
    staleTime: 10_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: QKEY });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Sticky header controls */}
      <header className="border border-border bg-bg-elev-1 rounded-sm flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-sm bg-bg-elev-2 p-3 text-fg">
            <IconBook className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-fg">Trading Journal</h1>
            <p className="text-body-sm text-fg-subtle mt-0.5">Track, analyze, and optimize your trading performance</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StaleIndicator isFetching={isFetching && !isLoading} />
          
          <button
            onClick={refresh}
            className="bg-bg-elev-1 border border-border size-10 flex items-center justify-center rounded-sm text-fg-muted hover:text-fg transition-all cursor-pointer"
            title="Refresh logs"
          >
            <IconRefresh className={cn("size-4", isFetching && "animate-spin")} />
          </button>

          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-fg px-4 text-xs font-bold text-black shadow-none/15 hover:opacity-90 transition-all cursor-pointer"
          >
            <IconPlus className="size-4" />
            <span>Log Trade</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-[350px] gap-2.5">
          <IconActivity className="size-6 text-fg animate-pulse" />
          <p className="text-xs font-bold uppercase tracking-wider text-fg-muted">Loading your metrics...</p>
        </div>
      ) : isError ? (
        <div className="border border-border bg-bg-elev-1 rounded-sm p-6 border-danger/20 bg-danger/5 text-center flex flex-col items-center justify-center gap-2">
          <p className="text-sm font-semibold text-danger" role="alert">Failed to load journal portfolio</p>
          <p className="text-xs text-fg-subtle">{(error as Error)?.message || 'Unknown network error'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Segmented
            value={tab}
            onChange={(next) => setTab(next as typeof tab)}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'analytics', label: 'Analytics' },
              { value: 'trades', label: 'Trades' },
            ]}
            ariaLabel="Journal view"
            role="tablist"
            variant="solid"
            groupId="journal-tabs"
          />

          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left Column: Equity curve and entries list (occupies 2/3 of desktop width) */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                {/* Cum R Equity Curve */}
                <PerformanceChart entries={data?.entries ?? []} />

                {/* Structured Trade logs list */}
                <EntryList entries={data?.entries ?? []} onClosed={refresh} onDeleted={refresh} />
              </div>

              {/* Right Column: IconKey performance metrics & analytics (occupies 1/3 of desktop width) */}
              <div className="lg:col-span-1">
                {data?.stats ? (
                  <div className="sticky top-[calc(var(--topbar-h)+24px)] flex flex-col gap-6">
                    <StatsSummary stats={data.stats} entries={data.entries} />
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {tab === 'analytics' && data?.stats && (
            <div className="flex flex-col gap-4">
              {(() => {
                const latestClosed = data.entries.find((e) => e.outcome !== 'open');
                return latestClosed ? <AiReviewPanel entry={latestClosed} /> : null;
              })()}
              <DrawdownChart entries={data.entries} stats={data.stats} />
              <RDistribution stats={data.stats} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BreakdownTable
                  title="By Symbol"
                  data={(data.stats.bySymbol ?? []).map((s) => ({
                    label: s.symbol,
                    trades: s.trades,
                    winRate: s.winRate,
                    totalR: s.totalR,
                    expectancy: s.expectancy,
                  }))}
                />
                <BreakdownTable
                  title="By Session"
                  data={(data.stats.bySession ?? []).map((s) => ({
                    label: s.session,
                    trades: s.trades,
                    winRate: s.winRate,
                    totalR: s.totalR,
                  }))}
                />
                <BreakdownTable
                  title="By Day of Week"
                  data={(data.stats.byDayOfWeek ?? []).map((s) => ({
                    label: s.day,
                    trades: s.trades,
                    winRate: s.winRate,
                    totalR: s.totalR,
                  }))}
                />
                <BreakdownTable
                  title="By Hour (UTC)"
                  data={(data.stats.byHour ?? []).map((s) => ({
                    label: `${s.hour.toString().padStart(2, '0')}:00`,
                    trades: s.trades,
                    winRate: s.winRate,
                    totalR: s.totalR,
                  }))}
                />
              </div>
              <BreakdownTable
                title="By Tag"
                data={(data.stats.byTag ?? []).map((s) => ({
                  label: s.tag,
                  trades: s.trades,
                  winRate: s.winRate,
                  totalR: s.totalR,
                  expectancy: s.expectancy,
                }))}
                sortBy="totalR"
              />
              <StreakDisplay stats={data.stats} />
            </div>
          )}

          {tab === 'trades' && (
            <EntryList entries={data?.entries ?? []} onClosed={refresh} onDeleted={refresh} />
          )}
        </div>
      )}

      {/* Slide-over Trade entry Logger Drawer */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-lg font-black tracking-tight text-fg">Log New Position</DrawerTitle>
            <DrawerDescription className="text-xs text-fg-subtle">
              Record entry, size, stop-loss, and target. Outcome stats calculate automatically upon trade closure.
            </DrawerDescription>
          </DrawerHeader>
          <EntryForm
            onCreated={() => {
              refresh();
              setOpen(false);
            }}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}



