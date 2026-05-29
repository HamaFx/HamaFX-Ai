import { z } from 'zod';
import { SymbolSchema } from '../../symbols';

export const GetIntermarketResonanceInputSchema = z.object({
  symbol: SymbolSchema.default('XAUUSD'),
  days: z.number().int().min(5).max(60).default(30),
});
export type GetIntermarketResonanceInput = z.infer<typeof GetIntermarketResonanceInputSchema>;

export const ResonanceObservationSchema = z.object({
  date: z.string(),
  realYieldPct: z.number().nullable(),
  breakevenInflationPct: z.number().nullable(),
  goldClose: z.number().nullable(),
  divergenceScore: z.number().nullable(),
});
export type ResonanceObservation = z.infer<typeof ResonanceObservationSchema>;

export const GetIntermarketResonanceOutputSchema = z.object({
  symbol: SymbolSchema,
  days: z.number(),
  observations: z.array(ResonanceObservationSchema),
  currentDivergence: z.number(),
  currentRealYield: z.number(),
  currentBreakevenInflation: z.number(),
  regime: z.enum(['convergent', 'divergent_hedging', 'divergent_discount']),
  narrative: z.string(),
});
export type GetIntermarketResonanceOutput = z.infer<typeof GetIntermarketResonanceOutputSchema>;
