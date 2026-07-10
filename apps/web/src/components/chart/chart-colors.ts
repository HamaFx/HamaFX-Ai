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
