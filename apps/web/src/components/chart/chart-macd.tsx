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

// ChartMACD — MACD oscillator sub-pane. Owns its own chart, three
// series (line, signal, histogram with up/down coloring). Time-synced
// with main chart.
//
// Per PLAN.md §4.3 — chart split.

import type * as LightweightCharts from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import type { Candle, IndicatorResult } from '@hamafx/shared';
import { SERIES_BEAR_HEX, SERIES_BULL_HEX, SERIES_MACD_HEX, SERIES_SIGNAL_HEX } from './chart-colors';
import type { ChartSettings, MainChartInstance } from './chart-types';
import { useChartTheme } from './use-chart-theme';

export interface ChartMACDProps {
  result: IndicatorResult;
  candles: Candle[];
  mainChart: MainChartInstance | null | undefined;
  settings: ChartSettings | null | undefined;
  onReady?: (host: MainChartInstance) => void;
}

type UTCTimestamp = LightweightCharts.UTCTimestamp;

export function ChartMACD({ result, candles, mainChart, settings, onReady }: ChartMACDProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<MainChartInstance | null>(null);
  const theme = useChartTheme(hostRef.current, settings);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !result) return;

    let cancelled = false;

    void import('lightweight-charts').then((lc) => {
      if (cancelled || !hostRef.current) return;
      const createChartFn =
        'createChart' in lc
          ? lc.createChart
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (lc as any).default?.createChart;
      if (!createChartFn) return;

      const chart = createChartFn(el, {
        layout: { background: { color: theme.colors.bg }, textColor: theme.colors.text, fontFamily: theme.fontFamily },
        grid: {
          vertLines: { color: theme.gridColor, style: theme.gridStyle },
          horzLines: { color: theme.gridColor, style: theme.gridStyle },
        },
        rightPriceScale: { borderColor: theme.colors.grid, visible: true },
        timeScale: { borderColor: theme.colors.grid, visible: false },
        crosshair: { mode: 1 },
        autoSize: true,
        handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: { time: false, price: false } },
      });

      const macdSeries = chart.addSeries(lc.LineSeries, { color: SERIES_MACD_HEX, lineWidth: 1.5, priceLineVisible: false });
      const signalSeries = chart.addSeries(lc.LineSeries, { color: SERIES_SIGNAL_HEX, lineWidth: 1.5, priceLineVisible: false });
      const histSeries = chart.addSeries(lc.HistogramSeries, { color: SERIES_BULL_HEX, priceFormat: { type: 'volume' }, priceLineVisible: false });

      // Intermediate LineSeries data arrays. Typed loosely because
      // lightweight-charts' LineData/HistogramData types are not
      // exported from this module's surface; the runtime shape is
      // just { time: UTCTimestamp, value: number }.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const macdData: any[] = [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signalData: any[] = [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        histData: any[] = [];
      result.values.forEach((v, idx) => {
        if (!v || typeof v !== 'object') return;
        const candle = candles[idx];
        if (!candle) return;
        const t = Math.floor(candle.t / 1000) as unknown as UTCTimestamp;
        if (v.macd !== null && v.macd !== undefined) macdData.push({ time: t, value: v.macd });
        if (v.signal !== null && v.signal !== undefined) signalData.push({ time: t, value: v.signal });
        const histVal =
          v.hist !== undefined
            ? v.hist
            : // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (v as any).histogram;
        if (histVal !== null && histVal !== undefined) {
          histData.push({
            time: t,
            value: histVal,
            color: histVal >= 0 ? SERIES_BULL_HEX : SERIES_BEAR_HEX,
          });
        }
      });

      macdSeries.setData(macdData);
      signalSeries.setData(signalData);
      histSeries.setData(histData);

      // Time-sync.
      const api = mainChart?.getChartApi() as { timeScale(): unknown } | null;
      if (api) {
        const mainTs = api.timeScale() as { getVisibleLogicalRange(): unknown; setVisibleLogicalRange(r: unknown): void; subscribeVisibleLogicalRangeChange(cb: (r: unknown) => void): void };
        const range = mainTs.getVisibleLogicalRange();
        if (range) (chart.timeScale() as { setVisibleLogicalRange(r: unknown): void }).setVisibleLogicalRange(range);
        mainTs.subscribeVisibleLogicalRangeChange((range) => {
          if (!range) return;
          (chart.timeScale() as { setVisibleLogicalRange(r: unknown): void }).setVisibleLogicalRange(range);
        });
      }

      const instance: MainChartInstance = {
        applyOptions: (opts) => chart.applyOptions(opts as never),
        applyDecimals: () => {},
        setCandles: () => {},
        setOverlays: () => {},
        setIndicators: () => {},
        resize: (w, h) => chart.resize(w, h, true),
        zoomIn: () => {},
        zoomOut: () => {},
        resetView: () => {},
        getChartApi: () => chart,
        dispose: () => chart.remove(),
      };
      instanceRef.current = instance;
      onReady?.(instance);
    });

    return () => {
      cancelled = true;
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, candles, mainChart]);

  useEffect(() => {
    const api = instanceRef.current?.getChartApi() as { applyOptions: (opts: unknown) => void } | null;
    if (!api) return;
    api.applyOptions({
      layout: { background: { color: theme.colors.bg }, textColor: theme.colors.text },
      grid: {
        vertLines: { color: theme.gridColor, style: theme.gridStyle },
        horzLines: { color: theme.gridColor, style: theme.gridStyle },
      },
      rightPriceScale: { borderColor: theme.colors.grid },
    });
  }, [theme]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      instanceRef.current?.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return <div ref={hostRef} className="h-full w-full" />;
}
