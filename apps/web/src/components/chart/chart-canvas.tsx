/* eslint-disable @typescript-eslint/no-explicit-any, no-empty, @typescript-eslint/no-unused-vars */
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

// ChartCanvas — primary candlestick pane. Owns the main lightweight-charts
// instance, manages candle/overlay/indicator data, exposes the imperative
// handle to the orchestrator via the `onReady` callback.
//
// Per PLAN.md §4.3 — extracted from the 939-LOC chart.tsx monolith.

import type * as LightweightCharts from 'lightweight-charts';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

import {
  SERIES_ATR_HEX,
  SERIES_BULL_HEX,
} from './chart-colors';
import type { Candle, IndicatorResult, Symbol } from '@hamafx/shared';
import type { ChartSettings, MainChartInstance } from './chart-types';
import type { OverlaySet } from './overlays';
import { useChartTheme } from './use-chart-theme';

export type ChartCanvasHandle = MainChartInstance;

export interface ChartCanvasProps {
  symbol: Symbol;
  candles: Candle[];
  indicatorResults?: IndicatorResult[] | null | undefined;
  overlays?: OverlaySet | null | undefined;
  settings: ChartSettings | null | undefined;
  heightClass?: string;
  /** Imperative ref the orchestrator attaches zoom in/out/reset to. */
  handleRef: Ref<ChartCanvasHandle>;
}

type LcModule = typeof LightweightCharts;
type UTCTimestamp = LightweightCharts.UTCTimestamp;

const PIVOT_COLORS = {
  pp: '#94a3b8', r1: '#f87171', r2: '#ef4444', r3: '#b91c1c',
  s1: '#34d399', s2: '#10b981', s3: '#047857',
} as const;

const PIVOT_TITLES = { pp: 'PP', r1: 'R1', r2: 'R2', r3: 'R3', s1: 'S1', s2: 'S2', s3: 'S3' } as const;

function getIndicatorColor(kind: string, period: number): string {
  if (kind === 'ema') {
    if (period === 20) return '#3b82f6';
    if (period === 50) return '#a855f7';
    if (period === 200) return SERIES_ATR_HEX;
    return '#60a5fa';
  }
  if (period === 50) return '#10b981';
  if (period === 100) return '#ec4899';
  return '#f43f5e';
}

export function ChartCanvas({
  symbol: _symbol,
  candles,
  indicatorResults,
  overlays,
  settings,
  heightClass = 'h-[60svh]',
  handleRef,
}: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<MainChartInstance | null>(null);
  const theme = useChartTheme(containerRef.current, settings);

  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const indicatorResultsRef = useRef(indicatorResults);
  indicatorResultsRef.current = indicatorResults;

  // Build the chart once on mount. Theme is re-applied below.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let instance: MainChartInstance | null = null;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !containerRef.current) return;
      instance = createMainChart(lc, el, settings ?? null);
      instanceRef.current = instance;
      // Force initial resize so canvas isn't 0×0.
      instance.resize(el.clientWidth, el.clientHeight);
      if (candlesRef.current.length > 0) instance.setCandles(candlesRef.current);
      if (overlaysRef.current) instance.setOverlays(overlaysRef.current);
      if (indicatorResultsRef.current) instance.setIndicators(indicatorResultsRef.current);
    });

    return () => {
      cancelled = true;
      instance?.dispose();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push fresh candle data whenever the query refetches.
  useEffect(() => {
    if (!candles || candles.length === 0) return;
    instanceRef.current?.setCandles(candles);
  }, [candles]);

  // Push overlays whenever they change.
  useEffect(() => {
    instanceRef.current?.setOverlays(overlays ?? null);
  }, [overlays]);

  // Push dynamic on-chart indicators whenever they update.
  useEffect(() => {
    instanceRef.current?.setIndicators(indicatorResults ?? null);
  }, [indicatorResults, candles]);

  // Apply theme changes to the live chart.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const chart = instance.getChartApi() as { applyOptions: (opts: unknown) => void } | null;
    if (!chart) return;
    chart.applyOptions({
      layout: { background: { color: theme.colors.bg }, textColor: theme.colors.text },
      grid: {
        vertLines: { color: theme.gridColor, style: theme.gridStyle },
        horzLines: { color: theme.gridColor, style: theme.gridStyle },
      },
      rightPriceScale: { borderColor: theme.colors.grid },
      timeScale: { borderColor: theme.colors.grid },
    });
  }, [theme, candles]);

  // Resize on container changes (mobile rotation).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      instanceRef.current?.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(
    handleRef,
    (): ChartCanvasHandle => ({
      applyOptions: (opts) => instanceRef.current?.applyOptions(opts as never),
      applyDecimals: (d) => instanceRef.current?.applyDecimals(d),
      setCandles: (c) => instanceRef.current?.setCandles(c),
      setOverlays: (o) => instanceRef.current?.setOverlays(o),
      setIndicators: (r) => instanceRef.current?.setIndicators(r),
      resize: (w, h) => instanceRef.current?.resize(w, h),
      zoomIn: () => instanceRef.current?.zoomIn(),
      zoomOut: () => instanceRef.current?.zoomOut(),
      resetView: () => instanceRef.current?.resetView(),
      getChartApi: () => instanceRef.current?.getChartApi() ?? null,
      dispose: () => instanceRef.current?.dispose(),
    }),
    [],
  );

  return (
    <div
      ref={containerRef}
      role="img"
      className={`w-full ${heightClass}`}
      aria-label={`${_symbol} chart`}
    />
  );
}

// ---------------------------------------------------------------------------

function createMainChart(
  lc: LcModule,
  container: HTMLElement,
  settings: ChartSettings | null,
): MainChartInstance {
  const themeName = settings?.theme ?? 'black';
  const gridKey = settings?.gridStyle ?? 'solid';
  const colors = {
    black: { bg: '#0c0c0c', grid: '#1f1f1f', text: '#a1a8b3' },
    slate: { bg: '#0f172a', grid: '#1e293b', text: '#94a3b8' },
    navy:  { bg: '#020617', grid: '#0f172a', text: '#64748b' },
    classic: { bg: '#0e1118', grid: '#262a35', text: '#a1a8b3' },
  }[themeName];
  const gridColor = gridKey === 'none' ? 'transparent' : colors.grid;
  const gridStyle = gridKey === 'dotted' ? 1 : 0;

  const createChartFn = ('createChart' in lc)
    ? lc.createChart
    : (lc as any).default?.createChart;
  if (!createChartFn) throw new Error('Could not find createChart function in imported module');

  const fontFamily =
    getComputedStyle(container).getPropertyValue('--font-sans') ||
    'Inter, system-ui, sans-serif';

  const chart = createChartFn(container, {
    layout: { background: { color: colors.bg }, textColor: colors.text, fontFamily },
    grid: {
      vertLines: { color: gridColor, style: gridStyle },
      horzLines: { color: gridColor, style: gridStyle },
    },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: { borderColor: colors.grid, timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 },
    autoSize: true,
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
  });

  // Theme-aware bull/bear.
  const cs = getComputedStyle(container);
  const bullColor = cs.getPropertyValue('--color-bull').trim() || SERIES_BULL_HEX;
  const bearColor = cs.getPropertyValue('--color-bear').trim() || '#f0594a';

  const candleSeries = chart.addSeries(lc.CandlestickSeries, {
    upColor: bullColor,
    downColor: bearColor,
    borderUpColor: bullColor,
    borderDownColor: bearColor,
    wickUpColor: bullColor,
    wickDownColor: bearColor,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  });

  let priceLineHandles: ReturnType<typeof candleSeries.createPriceLine>[] = [];
  let indicatorLineHandles: ReturnType<typeof chart.addSeries>[] = [];
  let currentCandles: Candle[] = [];

  return {
    applyOptions(opts: unknown) {
      chart.applyOptions(opts as never);
    },
    applyDecimals(d: number) {
      candleSeries.applyOptions({ priceFormat: { type: 'price', precision: d, minMove: 1 / 10 ** d } });
    },
    setCandles(candles: Candle[]) {
      currentCandles = candles;
      candleSeries.setData(
        candles.map((c) => ({
          time: Math.floor(c.t / 1000) as unknown as UTCTimestamp,
          open: c.o, high: c.h, low: c.l, close: c.c,
        })),
      );
    },
    setOverlays(overlays: OverlaySet | null) {
      const seriesAny = candleSeries as any;
      if (typeof seriesAny.setMarkers === 'function') {
        seriesAny.setMarkers(
          (overlays?.markers ?? []).map((m) => ({ ...m, size: Number(m.size) })),
        );
      }
      for (const h of priceLineHandles) {
        try { candleSeries.removePriceLine(h); } catch {}
      }
      priceLineHandles = [];
      for (const pl of overlays?.priceLines ?? []) {
        priceLineHandles.push(
          candleSeries.createPriceLine({
            ...pl,
            lineWidth: Number(pl.lineWidth) as 1 | 2 | 3 | 4,
            lineStyle: Number(pl.lineStyle) as 0 | 1 | 2 | 3 | 4,
          }),
        );
      }
    },
    setIndicators(results: IndicatorResult[] | null) {
      for (const s of indicatorLineHandles) {
        try { chart.removeSeries(s); } catch {}
      }
      indicatorLineHandles = [];
      if (!results) return;

      for (const res of results) {
        if (res.kind === 'ema' || res.kind === 'sma') {
          const period = res.params.period ?? 20;
          const color = getIndicatorColor(res.kind, period as number);
          const series = chart.addSeries(lc.LineSeries, {
            color, lineWidth: 2,
            title: `${res.kind.toUpperCase()} ${period}`,
            priceLineVisible: false,
          });
          indicatorLineHandles.push(series);
          series.setData(
            res.values.map((v, idx) => {
              if (v === null || v === undefined) return null;
              const value = typeof v === 'number' ? v : (v as any).value ?? null;
              if (value === null) return null;
              const candle = currentCandles[idx];
              if (!candle) return null;
              return {
                time: Math.floor(candle.t / 1000) as unknown as UTCTimestamp,
                value,
              };
            }).filter((d): d is { time: UTCTimestamp; value: number } => d !== null),
          );
        } else if (res.kind === 'bollinger') {
          const color = '#f5b041';
          const basisSeries = chart.addSeries(lc.LineSeries, { color, lineWidth: 1.5, title: 'BB Basis', priceLineVisible: false });
          const upperSeries = chart.addSeries(lc.LineSeries, { color: '#7d8693', lineWidth: 1, lineStyle: 1, title: 'BB Upper', priceLineVisible: false });
          const lowerSeries = chart.addSeries(lc.LineSeries, { color: '#7d8693', lineWidth: 1, lineStyle: 1, title: 'BB Lower', priceLineVisible: false });
          indicatorLineHandles.push(basisSeries, upperSeries, lowerSeries);
          const basisData: any[] = [], upperData: any[] = [], lowerData: any[] = [];
          res.values.forEach((v, idx) => {
            if (!v || typeof v !== 'object') return;
            const candle = currentCandles[idx];
            if (!candle) return;
            const t = Math.floor(candle.t / 1000) as unknown as UTCTimestamp;
            const basisVal = v.middle !== undefined ? v.middle : (v as any).basis;
            if (basisVal !== null && basisVal !== undefined) basisData.push({ time: t, value: basisVal });
            if (v.upper !== null && v.upper !== undefined) upperData.push({ time: t, value: v.upper });
            if (v.lower !== null && v.lower !== undefined) lowerData.push({ time: t, value: v.lower });
          });
          basisSeries.setData(basisData);
          upperSeries.setData(upperData);
          lowerSeries.setData(lowerData);
        } else if (res.kind === 'pivots') {
          const levels = ['pp', 'r1', 'r2', 'r3', 's1', 's2', 's3'] as const;
          for (const lvl of levels) {
            const series = chart.addSeries(lc.LineSeries, {
              color: PIVOT_COLORS[lvl],
              lineWidth: lvl === 'pp' ? 1.5 : 1,
              lineStyle: lvl === 'pp' ? 0 : 2,
              title: PIVOT_TITLES[lvl],
              priceLineVisible: false,
            });
            indicatorLineHandles.push(series);
            series.setData(
              res.values.map((v, idx) => {
                if (!v || typeof v !== 'object' || v[lvl] === null || v[lvl] === undefined) return null;
                const candle = currentCandles[idx];
                if (!candle) return null;
                return {
                  time: Math.floor(candle.t / 1000) as unknown as UTCTimestamp,
                  value: v[lvl] as number,
                };
              }).filter((d): d is { time: UTCTimestamp; value: number } => d !== null),
            );
          }
        }
      }
    },
    resize(w: number, h: number) {
      chart.resize(w, h, true);
    },
    zoomIn() {
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (range) {
        const w = range.to - range.from;
        ts.setVisibleLogicalRange({ from: range.from + w * 0.15, to: range.to - w * 0.15 });
      }
    },
    zoomOut() {
      const ts = chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (range) {
        const w = range.to - range.from;
        ts.setVisibleLogicalRange({ from: range.from - w * 0.15, to: range.to + w * 0.15 });
      }
    },
    resetView() {
      chart.timeScale().fitContent();
      chart.priceScale('right').resetMode();
    },
    getChartApi() {
      return chart;
    },
    dispose() {
      chart.remove();
    },
  };
}
