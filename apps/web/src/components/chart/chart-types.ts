// SPDX-License-Identifier: Apache-2.0

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
  updateLastCandle(candle: { time: number; open: number; high: number; low: number; close: number }): void;
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
