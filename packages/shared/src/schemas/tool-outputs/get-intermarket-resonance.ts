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
