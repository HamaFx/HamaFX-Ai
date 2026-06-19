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

import { date, doublePrecision, pgTable, timestamp } from 'drizzle-orm/pg-core';

/**
 * Historical intermarket resonance timeseries (Proposal 3).
 *
 * Stores daily macroeconomic indices and computed divergence scores to track
 * real-time institutional risk premium divergence against gold and major currencies.
 */
export const intermarketResonance = pgTable('intermarket_resonance', {
  /** UTC calendar day (YYYY-MM-DD). */
  date: date('date').primaryKey(),
  /** US 10-Year Real Yields (%) from FRED series DFII10. */
  realYieldPct: doublePrecision('real_yield_pct'),
  /** 10-Year Breakeven Inflation Rate (%) from FRED series T10YIE. */
  breakevenInflationPct: doublePrecision('breakeven_inflation_pct'),
  /** DXY index (geometric proxy). */
  dxyIndex: doublePrecision('dxy_index'),
  /** Gold closing mid price for the day. */
  goldClose: doublePrecision('gold_close'),
  /** Calculated divergence score (standardized gold vs yield divergence). */
  divergenceScore: doublePrecision('divergence_score'),
  /** Timestamp this observation row was written. */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type IntermarketResonanceRow = typeof intermarketResonance.$inferSelect;
export type IntermarketResonanceInsert = typeof intermarketResonance.$inferInsert;
