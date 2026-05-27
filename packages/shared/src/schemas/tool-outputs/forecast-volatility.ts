// Output envelope returned by the `forecast_volatility` AI tool.
//
// ATR-based forward-vol estimate for a `(symbol, horizon)` window with an
// optional event adjustment when a high-impact macro event lands inside
// the window. The expected range is the live mid ± expected move.
//
// Source of truth: packages/ai/src/tools/forecast-volatility.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';

export const ForecastVolatilityInputSchema = z.object({
  symbol: SymbolSchema,
  /** Bar timeframe ATR is computed against. */
  tf: TimeframeSchema.default('1h'),
  /** Forward-looking horizon in hours. */
  horizonHours: z.number().int().min(1).max(168).default(24),
});
export type ForecastVolatilityInput = z.infer<typeof ForecastVolatilityInputSchema>;

export const ForecastVolatilityOutputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  horizonHours: z.number().int(),
  asOf: z.number().int(),
  /** ATR(14) on the chosen timeframe, in pips. */
  atrPips: z.number(),
  /** ATR(14) over a 30-day baseline window for context. */
  atrPipsBaseline30d: z.number().nullable(),
  /** Expected move in pips across `horizonHours`. */
  expectedMovePips: z.number(),
  /** Live mid ± expectedMove projected to price space; null when no live mid. */
  expectedRange: z
    .object({
      low: z.number(),
      high: z.number(),
      mid: z.number(),
    })
    .nullable(),
  /** True when at least one high-impact macro event lands in the window. */
  eventAdjusted: z.boolean(),
  /**
   * Multiplier applied because of `eventAdjusted`. 1.0 when no event, 1.5
   * with a single high-impact event, 2.0 with two or more. Capped at 2.0.
   */
  eventMultiplier: z.number(),
  /** Optional next high-impact event the multiplier was derived from. */
  nextHighImpact: z
    .object({
      title: z.string(),
      whenIso: z.string(),
      currency: z.string().nullable(),
    })
    .nullable(),
  notes: z.string(),
});
export type ForecastVolatilityOutput = z.infer<typeof ForecastVolatilityOutputSchema>;
