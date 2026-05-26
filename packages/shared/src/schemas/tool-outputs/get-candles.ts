// Output envelope returned by the `get_candles` AI tool.
//
// Source of truth: packages/ai/src/tools/get-candles.ts execute() return type.

import { z } from 'zod';

import { CandleSchema } from '../candle';

export const GetCandlesOutputSchema = z.object({
  symbol: z.string(),
  tf: z.string(),
  candles: z.array(CandleSchema),
});

export type GetCandlesOutput = z.infer<typeof GetCandlesOutputSchema>;
