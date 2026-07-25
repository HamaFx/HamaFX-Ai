// SPDX-License-Identifier: Apache-2.0

// Shared color constants for chart-related UI. Mirror the design tokens in
// apps/web/src/app/globals.css under --color-bull / --color-bear.
// Hex literals because canvas-based rendering can be flaky with oklch
// literals on older iOS Safari.

export const SERIES_BULL_HEX = '#22C55E';   // mirrors --color-bull
export const SERIES_BEAR_HEX = '#EF4444';   // mirrors --color-bear
