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

// Premium Cumulative R-Multiple Performance Chart using lightweight-charts.
// Visualizes equity growth over time with clean canvas styling.
//
// H-2 audit fix: removed the file-level `eslint-disable
// @typescript-eslint/no-explicit-any` — the chart instance and area
// series are now typed via the lightweight-charts v5 public APIs.

import type { JournalEntry } from '@hamafx/shared';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import {IconTrendingUp, IconAward} from '@tabler/icons-react';
import { useEffect, useMemo, useRef } from 'react';

import { getThemeColors } from './chart';

interface PerformanceChartProps {
  entries: JournalEntry[];
  theme?: 'slate' | 'navy' | 'black' | 'classic';
  height?: number;
}

export function PerformanceChart({
  entries,
  theme = 'black',
  height = 220,
}: PerformanceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // IconFilter closed trades and calculate cumulative R-multiple series chronologically
  const chartData = useMemo(() => {
    const closed = entries
      .filter(
        (e): e is JournalEntry & { closedAt: number; rMultiple: number } =>
          e.closedAt !== null && e.rMultiple !== null && e.rMultiple !== undefined
      )
      .sort((a, b) => a.openedAt - b.openedAt); // order by trade entry/opened date

    let sum = 0;
    const result: { time: UTCTimestamp; value: number }[] = [];

    closed.forEach((e) => {
      sum += e.rMultiple;
      const t = Math.floor(e.closedAt / 1000);

      // Lightweight-charts requires strictly increasing times
      const last = result[result.length - 1];
      const time = last && t <= (last.time as unknown as number)
        ? ((last.time as unknown as number) + 1) as unknown as UTCTimestamp
        : t as unknown as UTCTimestamp;

      result.push({ time, value: sum });
    });

    return result;
  }, [entries]);

  const totalR = useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData[chartData.length - 1]!.value;
  }, [chartData]);

  // Handle Chart Lifecycle
  useEffect(() => {
    const el = containerRef.current;
    if (!el || chartData.length === 0) return;

    // Destroy existing chart instance before creating a new one
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    let cancelled = false;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !containerRef.current) return;

      const colors = getThemeColors(theme);

      // Lightweight-charts v5 exposes `createChart` as a named export.
      // The `default` fallback covers CommonJS interop shims that assign
      // the module to `.default` instead of using named exports.
      // We avoid `'createChart' in lc` narrowing (which makes the false
      // branch `never` because TS knows the property always exists) by
      // using `??` instead — at the type level `lc.createChart` is
      // always defined, but at runtime a misconfigured bundler could
      // leave it undefined, so the fallback is defensive.
      const createChartFn =
        lc.createChart ??
        (lc as unknown as { default?: { createChart: typeof lc.createChart } }).default?.createChart;
      if (!createChartFn) throw new Error('lightweight-charts createChart not found');

      const chart = createChartFn(containerRef.current, {
        height,
        layout: {
          background: { color: 'transparent' },
          textColor: colors.text,
          fontFamily: getComputedStyle(el).getPropertyValue('--font-sans') || 'Geist Sans, system-ui, sans-serif',
        },
        grid: {
          vertLines: { color: 'transparent' },
          horzLines: { color: colors.grid, style: 2 /* Dotted */ },
        },
        rightPriceScale: {
          borderColor: 'transparent',
          visible: true,
        },
        timeScale: {
          borderColor: 'transparent',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: 1,
          vertLine: { color: colors.text, style: 3 /* Dashed */ },
          horzLine: { color: colors.text, style: 3 },
        },
        autoSize: true,
        handleScroll: false,
        handleScale: false,
      });

      chartRef.current = chart;

      const areaSeries = chart.addSeries(lc.AreaSeries, {
        lineColor: totalR >= 0 ? '#eab308' : '#f0594a',
        topColor: totalR >= 0 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(240, 89, 74, 0.2)',
        bottomColor: 'rgba(0, 0, 0, 0)',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      seriesRef.current = areaSeries;
      areaSeries.setData(chartData);
      chart.timeScale().fitContent();
    });

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, theme, height]);

  // Keep colors updated when totalR changes
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.applyOptions({
      lineColor: totalR >= 0 ? '#eab308' : '#f0594a',
      topColor: totalR >= 0 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(240, 89, 74, 0.2)',
    });
  }, [totalR]);

  // Keep colors updated when theme dynamically changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const colors = getThemeColors(theme);
    chart.applyOptions({
      layout: { textColor: colors.text },
      grid: { horzLines: { color: colors.grid } },
    });
  }, [theme]);

  if (chartData.length < 2) {
    return (
      <div className="surface-panel flex h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="rounded-sm bg-bg-elev-2 p-3 text-fg">
          <IconTrendingUp className="size-6 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-fg">Performance Curve Loading</p>
        <p className="max-w-[280px] text-xs text-fg-subtle">
          Close at least two trades to begin plotting your cumulative R-multiple performance curve.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-panel relative overflow-hidden p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="rounded-sm bg-bg-elev-2 p-2 text-fg">
            <IconAward className="size-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-fg-subtle">Performance Curve</h4>
            <p className="text-xs text-fg-muted mt-0.5">Cumulative R-Multiple Growth</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-fg-muted font-medium uppercase tracking-wide">Net R-Score</span>
          <p className={`text-xl font-bold tracking-tight tabular-nums ${totalR >= 0 ? 'text-bull' : 'text-bear'}`}>
            {totalR >= 0 ? '+' : ''}{totalR.toFixed(2)}R
          </p>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-sm mt-1 bg-black/10">
        <div ref={containerRef} className="w-full" />
      </div>
    </div>
  );
}
