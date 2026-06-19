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
