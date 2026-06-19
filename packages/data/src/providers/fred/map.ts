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

// FRED release ↔ internal calendar mapping.
//
// The FRED API gives us upcoming release dates; we narrow to a curated list
// of high-impact releases relevant to USD (XAUUSD, EURUSD, GBPUSD all have
// a USD leg, so US macro events move all three).
//
// Adding a release: pick its release_id from
// https://fred.stlouisfed.org/releases — the table maps to our metadata.

import type { Importance } from '@hamafx/shared';

export interface FredReleaseMeta {
  /** Display title we show in the calendar UI. */
  title: string;
  importance: Importance;
  currency: 'USD' | 'EUR' | 'GBP';
  country: 'US' | 'EZ' | 'UK';
  /**
   * FRED series id that carries the headline number for this release. Used
   * by the actuals-backfill cron to look up the published value via
   * `/fred/series/observations`. Releases with multiple headline series
   * (e.g. CPI ≠ Core CPI) pick the one most-reported in news headlines.
   * Omit when no canonical series exists (FOMC decision, etc.).
   */
  seriesId?: string;
}

/**
 * Curated subset of FRED release IDs we care about. Coverage is intentionally
 * lean — adding more is cheap (one row) but every extra release adds noise.
 */
export const FRED_RELEASES: Record<number, FredReleaseMeta> = {
  // Bureau of Labor Statistics — Employment Situation (NFP, unemployment).
  50: {
    title: 'Employment Situation (NFP)',
    importance: 'high',
    currency: 'USD',
    country: 'US',
    seriesId: 'PAYEMS', // Total nonfarm payrolls
  },
  // Consumer Price Index.
  10: {
    title: 'Consumer Price Index (CPI)',
    importance: 'high',
    currency: 'USD',
    country: 'US',
    seriesId: 'CPIAUCSL', // CPI-U all items SA
  },
  // Personal Income & Outlays (PCE inflation).
  21: {
    title: 'Personal Income & Outlays (PCE)',
    importance: 'high',
    currency: 'USD',
    country: 'US',
    seriesId: 'PCEPI', // Personal Consumption Expenditures Price Index
  },
  // Producer Price Index.
  46: {
    title: 'Producer Price Index (PPI)',
    importance: 'medium',
    currency: 'USD',
    country: 'US',
    seriesId: 'PPIACO', // Producer Price Index All Commodities
  },
  // GDP.
  53: {
    title: 'Gross Domestic Product (GDP)',
    importance: 'high',
    currency: 'USD',
    country: 'US',
    seriesId: 'GDP', // Real GDP, current-dollar
  },
  // Retail Sales (Advance Monthly).
  86: {
    title: 'Retail Sales',
    importance: 'medium',
    currency: 'USD',
    country: 'US',
    seriesId: 'RSAFS', // Advance Retail Sales: Retail and Food Services
  },
  // Industrial Production & Capacity Utilization.
  20: {
    title: 'Industrial Production',
    importance: 'low',
    currency: 'USD',
    country: 'US',
    seriesId: 'INDPRO',
  },
  // FOMC Statement — no canonical numeric series; actual is the rate decision.
  101: {
    title: 'FOMC Decision',
    importance: 'high',
    currency: 'USD',
    country: 'US',
    seriesId: 'DFEDTARU', // Federal Funds Target Range Upper Limit
  },
};

export function fredImportance(releaseId: number): Importance {
  return FRED_RELEASES[releaseId]?.importance ?? 'low';
}

export function fredMeta(releaseId: number): FredReleaseMeta | null {
  return FRED_RELEASES[releaseId] ?? null;
}
