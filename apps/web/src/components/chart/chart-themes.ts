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

// Free-function form of the chart theme colors. Re-exported from
// chart.tsx for backwards compatibility with performance-chart.tsx.
// The hook-based consumer is use-chart-theme.ts.

import type { ChartSettings } from './chart-types';

const THEME_PRESETS: Record<NonNullable<ChartSettings['theme']>, { bg: string; grid: string; text: string }> = {
  black: { bg: '#0c0c0c', grid: '#1f1f1f', text: '#a1a8b3' },
  slate: { bg: '#0f172a', grid: '#1e293b', text: '#94a3b8' },
  navy:  { bg: '#020617', grid: '#0f172a', text: '#64748b' },
  classic: { bg: '#0e1118', grid: '#262a35', text: '#a1a8b3' },
};

export function getThemeColors(theme: NonNullable<ChartSettings['theme']>) {
  return THEME_PRESETS[theme] ?? THEME_PRESETS.black;
}
