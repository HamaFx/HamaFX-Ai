// SPDX-License-Identifier: Apache-2.0

import { SERIES_BEAR_HEX, SERIES_BULL_HEX } from './chart-colors';
import type { ChartSettings } from './chart-types';

export const THEME_PRESETS = {
  black: { bg: '#0c0c0c', grid: '#1f1f1f', text: '#a1a8b3', bull: SERIES_BULL_HEX, bear: SERIES_BEAR_HEX },
  slate: { bg: '#0f172a', grid: '#1e293b', text: '#94a3b8', bull: SERIES_BULL_HEX, bear: SERIES_BEAR_HEX },
  navy:  { bg: '#020617', grid: '#0f172a', text: '#64748b', bull: SERIES_BULL_HEX, bear: SERIES_BEAR_HEX },
  classic: { bg: '#0e1118', grid: '#262a35', text: '#a1a8b3', bull: SERIES_BULL_HEX, bear: SERIES_BEAR_HEX },
} as const;

export function getThemeColors(theme: NonNullable<ChartSettings['theme']>) {
  return THEME_PRESETS[theme] ?? THEME_PRESETS.black;
}
