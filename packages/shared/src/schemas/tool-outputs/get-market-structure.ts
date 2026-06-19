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

// Output envelope returned by the `get_market_structure` AI tool. The tool
// tail-trims each event list and adds a `summary` prose field, so the
// envelope is bespoke (it is NOT `StructureResultSchema`). We reuse the
// per-event sub-schemas directly.
//
// Source of truth: packages/ai/src/tools/get-market-structure.ts execute()
// return type.

import { z } from 'zod';

import {
  FvgZoneSchema,
  LiquiditySweepSchema,
  OrderBlockSchema,
  StructureEventSchema,
  SwingPointSchema,
} from '../structure';

export const GetMarketStructureOutputSchema = z.object({
  symbol: z.string(),
  tf: z.string(),
  /** Number of candles the result was computed against. */
  bars: z.number().int().nonnegative(),
  swings: z.array(SwingPointSchema).optional(),
  events: z.array(StructureEventSchema).optional(),
  fvg: z.array(FvgZoneSchema).optional(),
  orderBlocks: z.array(OrderBlockSchema).optional(),
  liquidity: z.array(LiquiditySweepSchema).optional(),
  /** Compact human-readable summary the model can echo verbatim. */
  summary: z.string(),
});

export type GetMarketStructureOutput = z.infer<typeof GetMarketStructureOutputSchema>;
