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

import { memo, useCallback, useState } from 'react';
import type { Candle, IndicatorResult } from '@hamafx/shared';
import { SERIES_ATR_HEX } from './chart-colors';
import type { ChartSettings, MainChartInstance } from './chart-types';
import { useSubPaneChart } from './use-sub-pane-chart';
import { chartTime, type IChartApi, type ISeriesApi, type LcModule, type Time } from './lc-adapter';

export interface ChartATRProps {
  result: IndicatorResult;
  candles: Candle[];
  mainChart: MainChartInstance | null | undefined;
  settings: ChartSettings | null | undefined;
  onReady?: (host: MainChartInstance) => void;
}

function areATRPropsEqual(prev: ChartATRProps, next: ChartATRProps): boolean {
  if (prev.settings !== next.settings) return false;
  if (prev.mainChart !== next.mainChart) return false;
  if (prev.onReady !== next.onReady) return false;
  // Compare result values by reference (indicator results change rarely).
  if (prev.result !== next.result) return false;
  // Compare last candle timestamp + OHLC — the only values that matter for ATR.
  const pc = prev.candles.length > 0 ? prev.candles[prev.candles.length - 1] : null;
  const nc = next.candles.length > 0 ? next.candles[next.candles.length - 1] : null;
  if (!pc || !nc) return pc === nc;
  return pc.t === nc.t && pc.o === nc.o && pc.h === nc.h && pc.l === nc.l && pc.c === nc.c;
}

export const ChartATR = memo(function ChartATR({ result, candles, mainChart, settings, onReady }: ChartATRProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

  const initSeries = useCallback((lc: LcModule, chart: IChartApi) => {
    const series = chart.addSeries(lc.LineSeries, {
      color: SERIES_ATR_HEX,
      lineWidth: 2,
      priceLineVisible: false,
    });
    return series;
  }, []);

  const updateData = useCallback((series: ISeriesApi<'Line'>, result: IndicatorResult, candles: Candle[]) => {
    series.setData(
      result.values
        .map((v, idx) => {
          if (v === null || v === undefined) return null;
          const candle = candles[idx];
          if (!candle) return null;
          return {
            time: chartTime(candle.t),
            value: typeof v === 'number' ? v : (v as { value?: number })?.value ?? null,
          };
        })
        .filter((d): d is { time: Time; value: number } => d !== null && d.value !== null)
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
}, areATRPropsEqual);
