// Output envelope returned by the `get_price` AI tool. Reuses the existing
// per-row `TickSchema` primitive — this file only describes the wrapper.
//
// Source of truth: packages/ai/src/tools/get-price.ts execute() return type.

import { z } from 'zod';

import { TickSchema } from '../tick';

export const GetPriceOutputSchema = z.object({
  ticks: z.array(TickSchema),
  /** ISO timestamp the answer was assembled at — drives freshness UI. */
  asOf: z.string(),
});

export type GetPriceOutput = z.infer<typeof GetPriceOutputSchema>;
