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

// ChartATR — Average True Range volatility sub-pane. Owns its own chart,
// single line series. Time-synced with main chart.
//
// Per PLAN.md §4.3 — chart split.

import type * as LightweightCharts from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import type { Candle, IndicatorResult } from '@hamafx/shared';
import { SERIES_ATR_HEX } from './chart-colors';
import type { ChartSettings, MainChartInstance } from './chart-types';
import { useChartTheme } from './use-chart-theme';

export interface ChartATRProps {
  result: IndicatorResult;
  candles: Candle[];
  mainChart: MainChartInstance | null | undefined;
  settings: ChartSettings | null | undefined;
  onReady?: (host: MainChartInstance) => void;
}
type UTCTimestamp = LightweightCharts.UTCTimestamp;

export function ChartATR({ result, candles, mainChart, settings, onReady }: ChartATRProps) {
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

      const series = chart.addSeries(lc.LineSeries, {
        color: SERIES_ATR_HEX, lineWidth: 1.5, priceLineVisible: false,
      });

      series.setData(
        result.values.map((v, idx) => {
          if (v === null || v === undefined) return null;
          const candle = candles[idx];
          if (!candle) return null;
          return {
            time: Math.floor(candle.t / 1000) as unknown as UTCTimestamp,
            value:
              typeof v === 'number'
                ? v
                : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (v as any)?.value ?? null,
          };
        }).filter((d): d is { time: UTCTimestamp; value: number } => d !== null && d.value !== null),
      );

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
