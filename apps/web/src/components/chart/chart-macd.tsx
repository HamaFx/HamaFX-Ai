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

import { useCallback, useState } from 'react';
import type * as LightweightCharts from 'lightweight-charts';
import type { Candle, IndicatorResult } from '@hamafx/shared';
import { SERIES_BEAR_HEX, SERIES_BULL_HEX, SERIES_MACD_HEX, SERIES_SIGNAL_HEX } from './chart-colors';
import type { ChartSettings, MainChartInstance } from './chart-types';
import { useSubPaneChart } from './use-sub-pane-chart';

export interface ChartMACDProps {
  result: IndicatorResult;
  candles: Candle[];
  mainChart: MainChartInstance | null | undefined;
  settings: ChartSettings | null | undefined;
  onReady?: (host: MainChartInstance) => void;
}

type UTCTimestamp = LightweightCharts.UTCTimestamp;

interface MACDSeries {
  macdSeries: LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>;
  signalSeries: LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>;
  histSeries: LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>;
}

export function ChartMACD({ result, candles, mainChart, settings, onReady }: ChartMACDProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  const initSeries = useCallback((lc: typeof LightweightCharts, chart: LightweightCharts.IChartApi) => {
    const macdSeries = chart.addSeries(lc.LineSeries, { color: SERIES_MACD_HEX, lineWidth: 2, priceLineVisible: false });
    const signalSeries = chart.addSeries(lc.LineSeries, { color: SERIES_SIGNAL_HEX, lineWidth: 2, priceLineVisible: false });
    const histSeries = chart.addSeries(lc.HistogramSeries, { color: SERIES_BULL_HEX, priceFormat: { type: 'volume' }, priceLineVisible: false });
    return { macdSeries, signalSeries, histSeries };
  }, []);

  const updateData = useCallback((series: MACDSeries, result: IndicatorResult, candles: Candle[]) => {
    const macdData: { time: UTCTimestamp; value: number }[] = [];
    const signalData: { time: UTCTimestamp; value: number }[] = [];
    const histData: { time: UTCTimestamp; value: number; color?: string }[] = [];

    result.values.forEach((v, idx) => {
      if (!v || typeof v !== 'object') return;
      const candle = candles[idx];
      if (!candle) return;
      const t = Math.floor(candle.t / 1000) as unknown as UTCTimestamp;
      
      const vTyped = v as { macd?: number | null; signal?: number | null; hist?: number | null; histogram?: number | null };
      
      if (vTyped.macd !== null && vTyped.macd !== undefined) macdData.push({ time: t, value: vTyped.macd });
      if (vTyped.signal !== null && vTyped.signal !== undefined) signalData.push({ time: t, value: vTyped.signal });
      
      const histVal = vTyped.hist !== undefined ? vTyped.hist : vTyped.histogram;
      if (histVal !== null && histVal !== undefined) {
        histData.push({
          time: t,
          value: histVal,
          color: histVal >= 0 ? SERIES_BULL_HEX : SERIES_BEAR_HEX,
        });
      }
    });

    series.macdSeries.setData(macdData);
    series.signalSeries.setData(signalData);
    series.histSeries.setData(histData);
  }, []);

  useSubPaneChart({
    containerEl,
    mainChart,
    settings,
    candles,
    result,
    onReady,
    initSeries,
    updateData,
  });

  return <div ref={setContainerEl} className="h-full w-full" />;
}
