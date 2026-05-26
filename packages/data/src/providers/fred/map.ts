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
}

/**
 * Curated subset of FRED release IDs we care about. Coverage is intentionally
 * lean — adding more is cheap (one row) but every extra release adds noise.
 */
export const FRED_RELEASES: Record<number, FredReleaseMeta> = {
  // Bureau of Labor Statistics — Employment Situation (NFP, unemployment).
  50: { title: 'Employment Situation (NFP)', importance: 'high', currency: 'USD', country: 'US' },
  // Consumer Price Index.
  10: { title: 'Consumer Price Index (CPI)', importance: 'high', currency: 'USD', country: 'US' },
  // Personal Income & Outlays (PCE inflation).
  21: { title: 'Personal Income & Outlays (PCE)', importance: 'high', currency: 'USD', country: 'US' },
  // Producer Price Index.
  46: { title: 'Producer Price Index (PPI)', importance: 'medium', currency: 'USD', country: 'US' },
  // GDP.
  53: { title: 'Gross Domestic Product (GDP)', importance: 'high', currency: 'USD', country: 'US' },
  // Retail Sales (Advance Monthly).
  86: { title: 'Retail Sales', importance: 'medium', currency: 'USD', country: 'US' },
  // Industrial Production & Capacity Utilization.
  20: { title: 'Industrial Production', importance: 'low', currency: 'USD', country: 'US' },
  // FOMC Statement (release id of FOMC press release schedule).
  101: { title: 'FOMC Decision', importance: 'high', currency: 'USD', country: 'US' },
};

export function fredImportance(releaseId: number): Importance {
  return FRED_RELEASES[releaseId]?.importance ?? 'low';
}

export function fredMeta(releaseId: number): FredReleaseMeta | null {
  return FRED_RELEASES[releaseId] ?? null;
}
