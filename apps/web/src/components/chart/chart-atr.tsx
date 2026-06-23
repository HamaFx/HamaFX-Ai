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
import { SERIES_ATR_HEX } from './chart-colors';
import type { ChartSettings, MainChartInstance } from './chart-types';
import { useSubPaneChart } from './use-sub-pane-chart';

export interface ChartATRProps {
  result: IndicatorResult;
  candles: Candle[];
  mainChart: MainChartInstance | null | undefined;
  settings: ChartSettings | null | undefined;
  onReady?: (host: MainChartInstance) => void;
}

type UTCTimestamp = LightweightCharts.UTCTimestamp;

export function ChartATR({ result, candles, mainChart, settings, onReady }: ChartATRProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  const initSeries = useCallback((lc: typeof LightweightCharts, chart: LightweightCharts.IChartApi) => {
    const series = chart.addSeries(lc.LineSeries, {
      color: SERIES_ATR_HEX,
      lineWidth: 2,
      priceLineVisible: false,
    });
    return series;
  }, []);

  const updateData = useCallback((series: LightweightCharts.ISeriesApi<LightweightCharts.SeriesType>, result: IndicatorResult, candles: Candle[]) => {
    series.setData(
      result.values
        .map((v, idx) => {
          if (v === null || v === undefined) return null;
          const candle = candles[idx];
          if (!candle) return null;
          return {
            time: Math.floor(candle.t / 1000) as unknown as UTCTimestamp,
            value: typeof v === 'number' ? v : (v as { value?: number })?.value ?? null,
          };
        })
        .filter((d): d is { time: UTCTimestamp; value: number } => d !== null && d.value !== null)
    );
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
