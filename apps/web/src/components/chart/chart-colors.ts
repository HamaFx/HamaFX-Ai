// SPDX-License-Identifier: Apache-2.0

// Shared color constants for chart series. Mirror the design tokens in
// apps/web/src/app/globals.css under --color-bull / --color-bear /
// --color-warn / --color-info. Hex literals because lightweight-charts'
// canvas paint pipeline has been flaky with oklch literals on older iOS
// Safari. If a token changes in globals.css, update the matching
// constant here.

export const SERIES_BULL_HEX = '#22C55E';   // mirrors --color-bull
export const SERIES_BEAR_HEX = '#EF4444';   // mirrors --color-bear
export const SERIES_MACD_HEX = '#2563eb';   // MACD line — deep blue, no direct token; candidate for --color-macd
export const SERIES_SIGNAL_HEX = '#F59E0B'; // mirrors --color-warn
export const SERIES_ATR_HEX = '#eab308';    // mirrors --color-warn  (amber variant)
export const SERIES_RSI_HEX = '#a855f7';    // purple — RSI oscillator line; independent from brand
export const SERIES_RSI_REF_HEX = '#7e22ce'; // RSI 30/70 reference lines (deeper purple)
