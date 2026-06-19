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
