/**
 * Copyright 2026 Kestrel
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

// Shared design tokens for Kestrel.
// The actual Tailwind theme lives in CSS via `@theme` (Tailwind v4) — see
// `apps/web/src/app/globals.css`. This file exposes the same token *values*
// to TS code (e.g., chart series colors, dynamic styles) so we have one source
// of truth.
//
// All colors are in OKLCH per docs/05-ui-ux.md. Keep keys stable — components
// reference them by name.

export const colors = {
  // surfaces (dark theme baseline)
  bg: '#0A0A0A',
  bgElev1: '#141414',
  bgElev2: '#1E1E1E',
  bgElev3: '#2A2A2A',
  border: '#262626',
  divider: '#1E1E1E',
  overlay: 'rgba(0, 0, 0, 0.80)',

  // text
  fg: '#F0F0F0',
  fgMuted: '#808080',
  fgSubtle: '#737373',

  // brand
  brand: '#F56E0F',
  brandFg: '#FFFFFF',
  brandSoft: '#FF9A4D',
  brandBorder: '#402A18',

  // market states (price/P&L only)
  bull: '#22C55E',
  bear: '#EF4444',
  neutral: '#71717A',
  warn: '#F59E0B',
  info: '#3B82F6',

  // system status
  success: '#16A34A',
  danger: '#DC2626',
} as const;

export type ColorToken = keyof typeof colors;

export const radii = {
  sm: '2px',
  md: '2px',
  lg: '2px',
  xl: '2px',
} as const;

export const motion = {
  durations: {
    xfast: '80ms',
    fast: '140ms',
    base: '220ms',
    slow: '340ms',
  },
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;
