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

// Typed adapter for lightweight-charts v5.
//
// Per the frontend audit, chart-canvas.tsx accumulated a high
// concentration of `as any` / `as unknown as` casts while talking to
// lightweight-charts. This module centralises those casts so the
// rest of the chart code can import typed helpers instead.
//
// The adapter is intentionally thin: it does not change the library
// semantics, it only provides a narrower, typed boundary.

import type * as LightweightCharts from 'lightweight-charts';

export type LcModule = typeof LightweightCharts;

// Helper used to describe partial options accepted by lightweight-charts.
// It recurses into objects but keeps arrays as arrays (unlike a naive
// mapped type which turns arrays into optional-indexed objects).
type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;

// Re-export common types so consumers don't need to import the library directly.
export type IChartApi = LightweightCharts.IChartApi;
export type ISeriesApi<T extends LightweightCharts.SeriesType> = LightweightCharts.ISeriesApi<T>;
export type SeriesType = LightweightCharts.SeriesType;
export type Time = LightweightCharts.Time;
export type UTCTimestamp = LightweightCharts.UTCTimestamp;
export type LineWidth = LightweightCharts.LineWidth;
export type LineStyle = LightweightCharts.LineStyle;
export type ChartOptions = LightweightCharts.ChartOptions;
export type MouseEventParams = LightweightCharts.MouseEventParams<LightweightCharts.Time>;
export type LogicalRange = LightweightCharts.LogicalRange;
export type SeriesMarker = LightweightCharts.SeriesMarker<LightweightCharts.Time>;
export type HistogramData = LightweightCharts.HistogramData<LightweightCharts.Time>;
export type LineData = LightweightCharts.LineData<LightweightCharts.Time>;
export type CandlestickData = LightweightCharts.CandlestickData<LightweightCharts.Time>;

export type ChartOptionsInput = DeepPartial<ChartOptions>;

/** Resolve `createChart` from either the named export or the default export. */
function getCreateChart(
  lc: LcModule,
): (container: HTMLElement, options?: ChartOptionsInput) => IChartApi {
  const fn =
    'createChart' in lc
      ? lc.createChart
      : (lc as unknown as { default?: { createChart: (container: HTMLElement, options?: ChartOptionsInput) => IChartApi } }).default
          ?.createChart;

  if (!fn) {
    throw new Error('Could not find createChart function in lightweight-charts module');
  }

  return fn;
}

export function createChart(
  lc: LcModule,
  container: HTMLElement,
  options?: ChartOptionsInput,
): IChartApi {
  return getCreateChart(lc)(container, options);
}

export function addCandlestickSeries(
  chart: IChartApi,
  lc: LcModule,
  options?: DeepPartial<LightweightCharts.CandlestickSeriesOptions>,
): ISeriesApi<'Candlestick'> {
  return chart.addSeries(lc.CandlestickSeries, options);
}

export function addLineSeries(
  chart: IChartApi,
  lc: LcModule,
  options?: DeepPartial<LightweightCharts.LineSeriesOptions>,
): ISeriesApi<'Line'> {
  return chart.addSeries(lc.LineSeries, options);
}

export function addHistogramSeries(
  chart: IChartApi,
  lc: LcModule,
  options?: DeepPartial<LightweightCharts.HistogramSeriesOptions>,
): ISeriesApi<'Histogram'> {
  return chart.addSeries(lc.HistogramSeries, options);
}

export interface PriceLineOptions {
  price: number;
  color: string;
  lineWidth?: number;
  lineStyle?: number;
  title?: string;
  axisLabelVisible?: boolean;
}

/** Convert a fractional/integer width to the library's narrow LineWidth union. */
export function asLineWidth(value: number): LineWidth {
  return value as unknown as LineWidth;
}

/** Convert a numeric line style to the library's LineWidth union. */
export function asLineStyle(value: number): LineStyle {
  return value as unknown as LineStyle;
}

/** Create a price line, coercing the width/style unions at the boundary. */
export function createPriceLine(
  series: ISeriesApi<SeriesType>,
  options: PriceLineOptions,
): ReturnType<ISeriesApi<SeriesType>['createPriceLine']> {
  const priceLineOptions: LightweightCharts.CreatePriceLineOptions = {
    price: options.price,
    color: options.color,
    lineWidth: asLineWidth(options.lineWidth ?? 1),
    lineStyle: asLineStyle(options.lineStyle ?? 0),
    ...(options.axisLabelVisible !== undefined && { axisLabelVisible: options.axisLabelVisible }),
  };
  if (options.title !== undefined) {
    priceLineOptions.title = options.title;
  }
  return series.createPriceLine(priceLineOptions);
}

/**
 * Convert our internal timestamp (milliseconds) to the shape
 * lightweight-charts expects. This is the one place the timestamp
 * cast is performed so consumers don't have to.
 */
export function chartTime(ms: number): Time {
  return (Math.floor(ms / 1000) as unknown) as Time;
}

/**
 * Convert a lightweight-charts Time back to epoch seconds. This is
 * the inverse of `chartTime` and is used when reading crosshair/time
 * values from the chart.
 */
export function timeToSeconds(time: Time): number {
  return time as unknown as number;
}

/** Safely remove a series, swallowing errors when it is already gone. */
export function removeSeries(chart: IChartApi, series: ISeriesApi<SeriesType>): void {
  try {
    chart.removeSeries(series);
  } catch {
    // Series may already have been removed; ignore.
  }
}

/** Safely remove a price line, swallowing errors when it is already gone. */
export function removePriceLine(
  series: ISeriesApi<SeriesType>,
  line: ReturnType<ISeriesApi<SeriesType>['createPriceLine']>,
): void {
  try {
    series.removePriceLine(line);
  } catch {
    // Price line may already have been removed; ignore.
  }
}

/** Set markers on a series. lightweight-charts v5 exposes this on the series. */
export function setMarkers(
  series: ISeriesApi<SeriesType>,
  markers: SeriesMarker[],
): void {
  const seriesAny = series as unknown as {
    setMarkers?: (markers: SeriesMarker[]) => void;
  };

  if (typeof seriesAny.setMarkers === 'function') {
    seriesAny.setMarkers(markers);
  }
}

/** Return the chart's time scale. */
export function getTimeScale(chart: IChartApi): ReturnType<IChartApi['timeScale']> {
  return chart.timeScale();
}

/** Return a named price scale. */
export function getPriceScale(
  chart: IChartApi,
  id: string,
): ReturnType<IChartApi['priceScale']> {
  return chart.priceScale(id);
}
