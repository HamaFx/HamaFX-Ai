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

// Shared types for the chart split. Per PLAN.md §4.3 — chart-canvas,
// chart-rsi, chart-macd, chart-atr, and the orchestrator chart.tsx all
// share these types via this file.

import type { Candle, IndicatorResult, Symbol, Timeframe } from '@hamafx/shared';

import type { OverlaySet } from './overlays';

export interface ChartSettings {
  theme: 'slate' | 'navy' | 'black' | 'classic';
  gridStyle: 'solid' | 'dotted' | 'none';
  bullColor?: string;
  bearColor?: string;
}

export type ChartThemeName = NonNullable<ChartSettings['theme']>;
export type GridStyleName = NonNullable<ChartSettings['gridStyle']>;

export interface ChartCommonProps {
  candles: Candle[];
  settings: ChartSettings | null | undefined;
}

/** Lightweight instance handle returned by the main chart factory. */
export interface MainChartInstance {
  applyOptions(opts: unknown): void;
  applyDecimals(d: number): void;
  setCandles(candles: Candle[]): void;
  setOverlays(overlays: OverlaySet | null): void;
  setIndicators(results: IndicatorResult[] | null): void;
  resize(w: number, h: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  /** Returns the underlying lightweight-charts IChartApi for time-sync. */
  getChartApi(): unknown;
  dispose(): void;
}

export interface ChartProps extends ChartCommonProps {
  symbol: Symbol;
  tf: Timeframe;
  indicatorResults?: IndicatorResult[] | null | undefined;
  overlays?: OverlaySet | null | undefined;
  heightClass?: string;
  className?: string;
}
