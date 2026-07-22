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

import { memo, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { SERIES_ATR_HEX } from './chart-colors';
import type { Candle, IndicatorResult, Symbol } from '@hamafx/shared';
import { priceDecimals } from '@hamafx/shared';
import type { ChartSettings, MainChartInstance } from './chart-types';
import type { OverlaySet } from './overlays';
import { useChartTheme } from './use-chart-theme';
import {
  addCandlestickSeries,
  addLineSeries,
  asLineWidth,
  chartTime,
  createChart,
  createPriceLine,
  removePriceLine,
  removeSeries,
  setMarkers,
  type ChartOptionsInput,
  type IChartApi,
  type ISeriesApi,
  type LcModule,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from './lc-adapter';

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

function areCanvasPropsEqual(prev: ChartCanvasProps, next: ChartCanvasProps): boolean {
  if (prev.symbol !== next.symbol) return false;
  if (prev.settings !== next.settings) return false;
  if (prev.heightClass !== next.heightClass) return false;
  if (prev.overlays !== next.overlays) return false;
  if (prev.indicatorResults !== next.indicatorResults) return false;
  // Compare candles by length + last candle OHLC.
  if (prev.candles.length !== next.candles.length) return false;
  const pc = prev.candles.length > 0 ? prev.candles[prev.candles.length - 1] : null;
  const nc = next.candles.length > 0 ? next.candles[next.candles.length - 1] : null;
  if (!pc || !nc) return pc === nc;
  return pc.t === nc.t && pc.o === nc.o && pc.h === nc.h && pc.l === nc.l && pc.c === nc.c;
}

export const ChartCanvas = memo(function ChartCanvas({
  symbol,
  candles,
  indicatorResults,
  overlays,
  settings,
  heightClass = 'h-[60svh]',
  handleRef,
}: ChartCanvasProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const instanceRef = useRef<MainChartInstance | null>(null);
  const theme = useChartTheme(containerEl, settings);

  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const prevCandleCountRef = useRef(candles.length);
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const indicatorResultsRef = useRef(indicatorResults);
  indicatorResultsRef.current = indicatorResults;

  // Build the chart once on mount. Theme is re-applied below.
  useEffect(() => {
    const el = containerEl;
    if (!el) return;

    let cancelled = false;
    let instance: MainChartInstance | null = null;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !containerEl) return;
      instance = createMainChart(lc, el, settings ?? null, theme);
      instanceRef.current = instance;
      // Force initial resize so canvas isn't 0×0 on first paint.
      // autoSize (ResizeObserver) handles subsequent resizes.
      instance.resize(el.clientWidth, el.clientHeight);
      // Apply correct decimal precision for the symbol immediately
      // (fixes race condition where applyDecimals was a no-op on first load).
      instance.applyDecimals(priceDecimals(symbol));
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
  }, [containerEl]);

  // Push fresh candle data whenever the query refetches.
  // On tick updates (same candle count), update only the last candle
  // to avoid a full setData() repaint and flickering.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const arr = candles || [];
    if (arr.length === 0) return;
    const prevCount = prevCandleCountRef.current;
    prevCandleCountRef.current = arr.length;
    // Set full data on initial load or when count changes (new candle).
    if (prevCount !== arr.length || prevCount === 0) {
      instance.setCandles(arr);
    } else if (arr.length > 0) {
      // Tick update — only update the last candle in-place.
      const last = arr[arr.length - 1]!;
      instance.updateLastCandle({
        time: Math.floor(last.t / 1000),
        open: last.o,
        high: last.h,
        low: last.l,
        close: last.c,
      });
    }
  }, [candles]);

  // Push overlays whenever they change.
  useEffect(() => {
    instanceRef.current?.setOverlays(overlays ?? null);
  }, [overlays]);

  // Push dynamic on-chart indicators only when indicator results change.
  // Previously also depended on [candles], which caused up to 12 indicator
  // series to be rebuilt on every 3-second price tick.
  useEffect(() => {
    instanceRef.current?.setIndicators(indicatorResults ?? null);
  }, [indicatorResults]);

  // Apply theme changes to the live chart.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const chart = instance.getChartApi() as IChartApi | null;
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
  }, [theme]);

  useImperativeHandle(
    handleRef,
    (): ChartCanvasHandle => ({
      applyOptions: (opts) => instanceRef.current?.applyOptions(opts),
      applyDecimals: (d) => instanceRef.current?.applyDecimals(d),
      setCandles: (c) => instanceRef.current?.setCandles(c),
      updateLastCandle: (c) => instanceRef.current?.updateLastCandle(c),
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

  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const trend = lastCandle ? (lastCandle.c >= lastCandle.o ? 'up' : 'down') : 'neutral';

  return (
    <div
      ref={setContainerEl}
      role="img"
      className={`w-full ${heightClass} relative`}
      aria-label={`${symbol} chart`}
    >
      <div role="status" aria-live="polite" className="sr-only">
        {lastCandle
          ? `${symbol} at ${lastCandle.c}, trend ${trend}, high ${lastCandle.h}, low ${lastCandle.l}`
          : `Loading ${symbol} chart data`}
      </div>
    </div>
  );
}, areCanvasPropsEqual);

// ---------------------------------------------------------------------------

function createMainChart(
  lc: LcModule,
  container: HTMLElement,
  settings: ChartSettings | null,
  theme: { colors: { bg: string; grid: string; text: string }; gridColor: string; gridStyle: 0 | 1 },
): MainChartInstance {
  const gridStyle = theme.gridStyle;

  const fontFamily =
    getComputedStyle(container).getPropertyValue('--font-sans').trim() ||
    'system-ui, sans-serif';

  const chart = createChart(lc, container, {
    layout: { background: { color: theme.colors.bg }, textColor: theme.colors.text, fontFamily },
    grid: {
      vertLines: { color: theme.gridColor, style: gridStyle },
      horzLines: { color: theme.gridColor, style: gridStyle },
    },
    rightPriceScale: { borderColor: theme.colors.grid },
    timeScale: { borderColor: theme.colors.grid, timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1 },
    autoSize: true,
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
  });

  // Theme-aware bull/bear from CSS custom properties (single source of truth)
  const cs = getComputedStyle(container);
  const bullColor = cs.getPropertyValue('--color-bull').trim();
  const bearColor = cs.getPropertyValue('--color-bear').trim();

  const candleSeries = addCandlestickSeries(chart, lc, {
    upColor: bullColor,
    downColor: bearColor,
    borderUpColor: bullColor,
    borderDownColor: bearColor,
    wickUpColor: bullColor,
    wickDownColor: bearColor,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  });

  let priceLineHandles: ReturnType<typeof candleSeries.createPriceLine>[] = [];
  let indicatorLineHandles: ISeriesApi<SeriesType>[] = [];
  let currentCandles: Candle[] = [];

  return {
    applyOptions(opts: unknown) {
      chart.applyOptions(opts as ChartOptionsInput);
    },
    applyDecimals(d: number) {
      candleSeries.applyOptions({ priceFormat: { type: 'price', precision: d, minMove: 1 / 10 ** d } });
    },
    setCandles(candles: Candle[]) {
      currentCandles = candles;
      candleSeries.setData(
        candles.map((c) => ({
          time: chartTime(c.t),
          open: c.o, high: c.h, low: c.l, close: c.c,
        })),
      );
    },
    updateLastCandle(candle: { time: number; open: number; high: number; low: number; close: number }) {
      // Keep currentCandles in sync so indicator timestamp lookups use fresh data.
      if (currentCandles.length > 0) {
        const last = currentCandles[currentCandles.length - 1]!;
        last.o = candle.open;
        last.h = candle.high;
        last.l = candle.low;
        last.c = candle.close;
      }
      candleSeries.update({
        time: chartTime(candle.time * 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
    },
    setOverlays(overlays: OverlaySet | null) {
      const markers = (overlays?.markers ?? []).map((m) => ({ ...m, size: Number(m.size) })) as SeriesMarker[];
      setMarkers(candleSeries, markers);

      for (const h of priceLineHandles) {
        removePriceLine(candleSeries, h);
      }
      priceLineHandles = [];
      for (const pl of overlays?.priceLines ?? []) {
        priceLineHandles.push(
          createPriceLine(candleSeries, {
            price: pl.price,
            color: pl.color,
            lineWidth: Number(pl.lineWidth),
            lineStyle: Number(pl.lineStyle),
            axisLabelVisible: pl.axisLabelVisible,
            title: pl.title,
          }),
        );
      }
    },
    setIndicators(results: IndicatorResult[] | null) {
      for (const s of indicatorLineHandles) {
        removeSeries(chart, s);
      }
      indicatorLineHandles = [];
      if (!results) return;

      for (const res of results) {
        if (res.kind === 'ema' || res.kind === 'sma') {
          const period = res.params.period ?? 20;
          const color = getIndicatorColor(res.kind, period as number);
          const series = addLineSeries(chart, lc, {
            color, lineWidth: 2,
            title: `${res.kind.toUpperCase()} ${period}`,
            priceLineVisible: false,
          });
          indicatorLineHandles.push(series as ISeriesApi<SeriesType>);
          series.setData(
            res.values.map((v, idx) => {
              if (v === null || v === undefined) return null;
              const value =
                typeof v === 'number'
                  ? v
                  : (v as { value?: number | null })?.value ?? null;
              if (value === null) return null;
              const candle = currentCandles[idx];
              if (!candle) return null;
              return {
                time: chartTime(candle.t),
                value,
              };
            }).filter((d): d is { time: Time; value: number } => d !== null),
          );
        } else if (res.kind === 'bollinger') {
          const color = '#f5b041';
          const basisSeries = addLineSeries(chart, lc, {
            color, lineWidth: asLineWidth(1.5), title: 'BB Basis', priceLineVisible: false,
          });
          const upperSeries = addLineSeries(chart, lc, {
            color: '#7d8693', lineWidth: 2, lineStyle: 1, title: 'BB Upper', priceLineVisible: false,
          });
          const lowerSeries = addLineSeries(chart, lc, {
            color: '#7d8693', lineWidth: 2, lineStyle: 1, title: 'BB Lower', priceLineVisible: false,
          });
          indicatorLineHandles.push(
            basisSeries as ISeriesApi<SeriesType>,
            upperSeries as ISeriesApi<SeriesType>,
            lowerSeries as ISeriesApi<SeriesType>,
          );
          const basisData: { time: Time; value: number }[] = [];
          const upperData: { time: Time; value: number }[] = [];
          const lowerData: { time: Time; value: number }[] = [];
          res.values.forEach((v, idx) => {
            if (!v || typeof v !== 'object') return;
            const candle = currentCandles[idx];
            if (!candle) return;
            const t = chartTime(candle.t);
            const basisVal =
              v.middle !== undefined
                ? v.middle
                : (v as { basis?: number }).basis;
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
            const series = addLineSeries(chart, lc, {
              color: PIVOT_COLORS[lvl],
              // lightweight-charts v5 types LineWidth as integer union, but
              // the canvas renderer accepts fractional widths at runtime.
              lineWidth: lvl === 'pp' ? asLineWidth(1.5) : 2,
              lineStyle: lvl === 'pp' ? 0 : 1,
              title: PIVOT_TITLES[lvl],
              priceLineVisible: false,
            });
            indicatorLineHandles.push(series as ISeriesApi<SeriesType>);
            series.setData(
              res.values.map((v, idx) => {
                if (!v || typeof v !== 'object' || v[lvl] === null || v[lvl] === undefined) return null;
                const candle = currentCandles[idx];
                if (!candle) return null;
                return {
                  time: chartTime(candle.t),
                  value: v[lvl] as number,
                };
              }).filter((d): d is { time: Time; value: number } => d !== null),
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
    },
    getChartApi() {
      return chart;
    },
    dispose() {
      chart.remove();
    },
  };
}
