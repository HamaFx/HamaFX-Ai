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
