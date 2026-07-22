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

import { useEffect, useRef, useState } from 'react';
import type { Candle, IndicatorResult } from '@hamafx/shared';
import type { MainChartInstance, ChartSettings } from './chart-types';
import { useChartTheme } from './use-chart-theme';
import { useLightweightCharts } from './use-lightweight-charts';
import {
  createChart,
  type ChartOptionsInput,
  type IChartApi,
  type ISeriesApi,
  type LcModule,
  type LogicalRange,
  type MouseEventParams,
  type SeriesType,
} from './lc-adapter';

export interface SubPaneOptions<TSeries> {
  containerEl: HTMLDivElement | null;
  mainChart: MainChartInstance | null | undefined;
  settings: ChartSettings | null | undefined;
  candles: Candle[];
  result: IndicatorResult;
  onReady?: ((host: MainChartInstance) => void) | undefined;
  initSeries: (lc: LcModule, chart: IChartApi) => TSeries;
  updateData: (
    series: TSeries,
    result: IndicatorResult,
    candles: Candle[],
    lc: LcModule
  ) => void;
}

export function useSubPaneChart<TSeries>({
  containerEl,
  mainChart,
  settings,
  candles,
  result,
  onReady,
  initSeries,
  updateData,
}: SubPaneOptions<TSeries>) {
  const { lc } = useLightweightCharts();
  const theme = useChartTheme(containerEl, settings);    const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<TSeries | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const mainChartRef = useRef(mainChart);

  const [isReady, setIsReady] = useState(false);

  // 1. Chart initialization (mount once, or when container/mainChart changes)
  useEffect(() => {
    if (!lc || !containerEl) return;

    // STAB-14: Compare mainChart identity by its underlying chart API,
    // not by the wrapper object reference. This prevents unnecessary
    // destroy/recreate cycles when the parent passes a new wrapper
    // object that points to the same underlying chart.
    const previousApi =
      mainChartRef.current?.getChartApi?.() as IChartApi | undefined;
    const currentApi =
      mainChart?.getChartApi?.() as IChartApi | undefined;
    if (previousApi && currentApi && previousApi === currentApi && chartRef.current) {
      // Update the ref but don't rebuild — same underlying chart.
      mainChartRef.current = mainChart;
      return;
    }

    // Destroy old sub-pane before rebuilding for a new mainChart identity
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setIsReady(false);
      prevCandleCount.current = 0; // reset so symbol-switch always triggers initial data load
    }
    mainChartRef.current = mainChart;

    const chart = createChart(lc, containerEl, {
      layout: {
        background: { color: theme.colors.bg },
        textColor: theme.colors.text,
        fontFamily: theme.fontFamily,
      },
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

    chartRef.current = chart;
    const series = initSeries(lc, chart);
    seriesRef.current = series;

    const instance: MainChartInstance = {
      applyOptions: (opts) => chart.applyOptions(opts as ChartOptionsInput),
      applyDecimals: () => {},
      setCandles: () => {},
      updateLastCandle: () => {},
      setOverlays: () => {},
      setIndicators: () => {},
      resize: (w, h) => chart.resize(w, h, true),
      zoomIn: () => {},
      zoomOut: () => {},
      resetView: () => {},
      getChartApi: () => chart,
      dispose: () => chart.remove(),
    };

    onReadyRef.current?.(instance);
    setIsReady(true);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setIsReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lc, containerEl, mainChart]);

  const prevCandleCount = useRef(candles.length);

  // 2. Data Updates — only fire when candle count changes (new candle formed),
  // not on every price tick which merely updates the latest candle's o/h/l/c.
  useEffect(() => {
    if (!isReady || !lc || !chartRef.current || !seriesRef.current || !result) return;
    // Skip update on price-only ticks — indicators are analyzed on closed candles.
    if (candles.length === prevCandleCount.current && prevCandleCount.current > 0) return;
    prevCandleCount.current = candles.length;
    updateData(seriesRef.current, result, candles, lc);
  }, [isReady, lc, result, candles, updateData]);

  // 3. Theme Application
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      layout: {
        background: { color: theme.colors.bg },
        textColor: theme.colors.text,
      },
      grid: {
        vertLines: { color: theme.gridColor, style: theme.gridStyle },
        horzLines: { color: theme.gridColor, style: theme.gridStyle },
      },
      rightPriceScale: { borderColor: theme.colors.grid },
    });
  }, [theme]);

  // 4. Time-Sync and Crosshair-Sync with Main Chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainChart) return;

    const mainApi = mainChart.getChartApi() as IChartApi | null;
    if (!mainApi) return;

    const mainTs = mainApi.timeScale();
    const subTs = chart.timeScale();

    // Initial time sync
    const range = mainTs.getVisibleLogicalRange();
    if (range) {
      subTs.setVisibleLogicalRange(range);
    }

    const handleRangeChange = (r: LogicalRange | null) => {
      if (!r) return;
      subTs.setVisibleLogicalRange(r);
    };

    mainTs.subscribeVisibleLogicalRangeChange(handleRangeChange);

    // Crosshair Sync
    const handleMainCrosshairMove = (param: MouseEventParams) => {
      if (param.point === undefined) return; // Prevent loops
      if (param.time && seriesRef.current) {
        const currentSeries = seriesRef.current;
        const firstSeries =
          typeof (currentSeries as { setData?: unknown }).setData === 'function'
            ? (currentSeries as unknown as ISeriesApi<SeriesType>)
            : (Object.values(currentSeries as unknown as Record<string, ISeriesApi<SeriesType>>)[0]);
        if (firstSeries) {
          chart.setCrosshairPosition(0, param.time, firstSeries);
        }
      } else {
        chart.clearCrosshairPosition();
      }
    };

    mainApi.subscribeCrosshairMove(handleMainCrosshairMove);

    return () => {
      mainTs.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      mainApi.unsubscribeCrosshairMove(handleMainCrosshairMove);
    };
  }, [isReady, mainChart]);
}
