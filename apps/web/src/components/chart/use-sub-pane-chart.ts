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
import type * as LightweightCharts from 'lightweight-charts';
import type { Candle, IndicatorResult } from '@hamafx/shared';
import type { MainChartInstance, ChartSettings } from './chart-types';
import { useChartTheme } from './use-chart-theme';
import { useLightweightCharts } from './use-lightweight-charts';

export interface SubPaneOptions<TSeries> {
  containerEl: HTMLDivElement | null;
  mainChart: MainChartInstance | null | undefined;
  settings: ChartSettings | null | undefined;
  candles: Candle[];
  result: IndicatorResult;
  onReady?: ((host: MainChartInstance) => void) | undefined;
  initSeries: (
    lc: typeof LightweightCharts,
    chart: LightweightCharts.IChartApi
  ) => TSeries;
  updateData: (
    series: TSeries,
    result: IndicatorResult,
    candles: Candle[],
    lc: typeof LightweightCharts
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
  const lc = useLightweightCharts();
  const theme = useChartTheme(containerEl, settings);
  const chartRef = useRef<LightweightCharts.IChartApi | null>(null);
  const seriesRef = useRef<TSeries | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [isReady, setIsReady] = useState(false);

  // 1. Chart initialization (mount once, or when container/mainChart changes)
  useEffect(() => {
    if (!lc || !containerEl) return;

    const createChartFn =
      'createChart' in lc
        ? lc.createChart
        : (lc as unknown as { default?: { createChart: typeof LightweightCharts.createChart } }).default?.createChart;
    if (!createChartFn) return;

    const chart = createChartFn(containerEl, {
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

  // 2. Data Updates
  useEffect(() => {
    if (!isReady || !lc || !chartRef.current || !seriesRef.current || !result) return;
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

    const mainApi = mainChart.getChartApi() as LightweightCharts.IChartApi | null;
    if (!mainApi) return;

    const mainTs = mainApi.timeScale();
    const subTs = chart.timeScale();

    // Initial time sync
    const range = mainTs.getVisibleLogicalRange();
    if (range) {
      subTs.setVisibleLogicalRange(range);
    }

    const handleRangeChange = (r: LightweightCharts.LogicalRange | null) => {
      if (!r) return;
      subTs.setVisibleLogicalRange(r);
    };

    mainTs.subscribeVisibleLogicalRangeChange(handleRangeChange);

    // Crosshair Sync
    const handleMainCrosshairMove = (param: LightweightCharts.MouseEventParams<LightweightCharts.Time>) => {
      if (param.point === undefined) return; // Prevent loops
      if (param.time && seriesRef.current) {
        const currentSeries = seriesRef.current;
        const firstSeries =
          typeof (currentSeries as { setData?: unknown }).setData === 'function'
            ? (currentSeries as unknown as LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>)
            : (Object.values(currentSeries as unknown as Record<string, LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>>)[0]);
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
