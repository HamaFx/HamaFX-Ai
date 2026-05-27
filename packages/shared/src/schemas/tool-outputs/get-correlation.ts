// Output envelope returned by the `get_correlation` AI tool.
//
// Returns a Pearson correlation matrix over close-to-close returns for
// the supported symbols at a given timeframe + window, plus a derived
// USD-strength proxy ("DXY proxy") computed from the FX legs only.
// The `dxyProxy.formula` field is the verbatim formula + weights so any
// agent answer can cite it.
//
// Source of truth: packages/ai/src/tools/get-correlation.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';

export const GetCorrelationInputSchema = z.object({
  tf: TimeframeSchema.default('1h'),
  windowBars: z.number().int().min(20).max(500).default(100),
});
export type GetCorrelationInput = z.infer<typeof GetCorrelationInputSchema>;

export const CorrelationCellSchema = z.object({
  a: SymbolSchema,
  b: SymbolSchema,
  /** Pearson correlation in [-1, 1] (clamped against floating-point drift). */
  r: z.number().min(-1.001).max(1.001),
});
export type CorrelationCell = z.infer<typeof CorrelationCellSchema>;

export const GetCorrelationOutputSchema = z.object({
  tf: TimeframeSchema,
  windowBars: z.number().int(),
  asOf: z.number().int(),
  matrix: z.array(CorrelationCellSchema),
  dxyProxy: z.object({
    /** Synthetic USD-strength index. Typically near 100 with the chosen formula. */
    value: z.number(),
    /** Percent change of the proxy across the most recent 24 hours of bars. */
    change24h: z.number(),
    /** Bars used to compute the value. */
    samples: z.number().int(),
    /** Verbatim formula + weights so the agent can cite it. */
    formula: z.string(),
  }),
});
export type GetCorrelationOutput = z.infer<typeof GetCorrelationOutputSchema>;
