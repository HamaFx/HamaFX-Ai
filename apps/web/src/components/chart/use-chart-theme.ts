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

// useChartTheme — single source of truth for chart colors, grid styling,
// and font family. Resolves CSS variables (oklch) to hex at call time
// because lightweight-charts v5's canvas paint pipeline has been flaky
// with oklch literals on older iOS Safari.
//
// Per PLAN.md §4.3 — chart component split. This hook is the first of
// five files; the chart-canvas, chart-rsi, chart-macd, chart-atr, and
// the orchestrator chart.tsx all consume it.

import { useMemo } from 'react';

import type { ChartSettings } from './chart-types';
import { THEME_PRESETS } from './chart-themes';

export interface ChartTheme {
  colors: {
    bg: string;
    grid: string;
    text: string;
    bull: string;
    bear: string;
  };
  /** "transparent" when gridStyle === 'none', otherwise colors.grid */
  gridColor: string;
  /** lightweight-charts grid style enum value */
  gridStyle: 0 | 1;
  fontFamily: string;
}

const FALLBACK: ChartTheme['colors'] = THEME_PRESETS.black;

/**
 * Resolves the chart theme. Pass the element ref so we can read
 * computed CSS variable values (oklch → hex fallback for the canvas
 * paint pipeline).
 */
export function useChartTheme(
  el: HTMLElement | null,
  settings: ChartSettings | null | undefined,
): ChartTheme {
  return useMemo<ChartTheme>(() => {
    const themeKey = settings?.theme ?? 'black';
    const gridKey = settings?.gridStyle ?? 'solid';
    const base = THEME_PRESETS[themeKey] ?? FALLBACK;

    const fontFamily = el
      ? getComputedStyle(el).getPropertyValue('--font-sans').trim() || 'Inter, system-ui, sans-serif'
      : 'Inter, system-ui, sans-serif';

    return {
      colors: base,
      gridColor: gridKey === 'none' ? 'transparent' : base.grid,
      gridStyle: gridKey === 'dotted' ? 1 : 0,
      fontFamily,
    };
  }, [el, settings?.theme, settings?.gridStyle]);
}
