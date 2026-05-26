// Shared design tokens for HamaFX-Ai.
// The actual Tailwind theme lives in CSS via `@theme` (Tailwind v4) — see
// `apps/web/src/app/globals.css`. This file exposes the same token *values*
// to TS code (e.g., chart series colors, dynamic styles) so we have one source
// of truth.
//
// All colors are in OKLCH per docs/05-ui-ux.md. Keep keys stable — components
// reference them by name.

export const colors = {
  // surfaces (dark theme baseline)
  bg: 'oklch(15% 0.02 260)',
  bgElev1: 'oklch(18% 0.02 260)',
  bgElev2: 'oklch(22% 0.02 260)',
  border: 'oklch(28% 0.02 260)',

  // text
  fg: 'oklch(96% 0.01 260)',
  fgMuted: 'oklch(72% 0.02 260)',
  fgSubtle: 'oklch(70% 0.02 260)',

  // brand
  brand: 'oklch(72% 0.16 78)',
  brandFg: 'oklch(15% 0.02 260)',

  // states
  bull: 'oklch(72% 0.18 150)',
  bear: 'oklch(67% 0.22 25)',
  neutral: 'oklch(70% 0.02 260)',
  warn: 'oklch(78% 0.16 80)',
  info: 'oklch(72% 0.14 230)',
} as const;

export type ColorToken = keyof typeof colors;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '16px',
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
