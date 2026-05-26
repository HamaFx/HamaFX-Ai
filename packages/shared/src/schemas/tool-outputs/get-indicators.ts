// Output envelope returned by the `get_indicators` AI tool. The tool truncates
// each result's `values` array to the last 30 points but otherwise the shape
// matches `IndicatorResultSchema`, so we reuse it here.
//
// Source of truth: packages/ai/src/tools/get-indicators.ts execute() return type.

import { z } from 'zod';

import { IndicatorResultSchema } from '../indicator';

export const GetIndicatorsOutputSchema = z.object({
  symbol: z.string(),
  tf: z.string(),
  results: z.array(IndicatorResultSchema),
});

export type GetIndicatorsOutput = z.infer<typeof GetIndicatorsOutputSchema>;
