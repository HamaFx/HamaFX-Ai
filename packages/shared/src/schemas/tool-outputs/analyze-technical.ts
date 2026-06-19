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

// Output envelope returned by the `analyze_technical` AI tool. The tool
// orchestrates `get_candles` + indicator computation + structure detection
// across a list of timeframes and returns a typed per-timeframe reading
// plus a deterministic summary string.
//
// Source of truth: packages/ai/src/tools/analyze-technical.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';

export const AnalyzeTechnicalInputSchema = z.object({
  symbol: SymbolSchema,
  /** Defaults to ['4h', '1h', '15m']. */
  timeframes: z.array(TimeframeSchema).min(1).max(5).default(['4h', '1h', '15m']),
});
export type AnalyzeTechnicalInput = z.infer<typeof AnalyzeTechnicalInputSchema>;

export const TrendSchema = z.union([z.literal('up'), z.literal('down'), z.literal('range')]);
export const BiasSchema = z.union([z.literal('bullish'), z.literal('bearish'), z.literal('neutral')]);
export const StructureEventTagSchema = z.union([
  z.literal('BOS_up'),
  z.literal('BOS_down'),
  z.literal('CHoCH_up'),
  z.literal('CHoCH_down'),
]);

export const PerTimeframeReadingSchema = z.object({
  tf: TimeframeSchema,
  trend: TrendSchema,
  bias: BiasSchema,
  momentum: z.object({
    rsi14: z.number(),
    macdHist: z.number(),
  }),
  structure: z.object({
    swingHigh: z.number().nullable(),
    swingLow: z.number().nullable(),
    latestStructureEvent: StructureEventTagSchema.nullable(),
  }),
  levels: z.object({
    pivot: z.number().nullable(),
    r1: z.number().nullable(),
    s1: z.number().nullable(),
    atr14: z.number().nullable(),
  }),
});
export type PerTimeframeReading = z.infer<typeof PerTimeframeReadingSchema>;

export const AnalyzeTechnicalOutputSchema = z.object({
  symbol: SymbolSchema,
  /** ms epoch UTC at which the analysis was computed. */
  asOf: z.number().int(),
  perTimeframe: z.array(PerTimeframeReadingSchema),
  summary: z.string(),
  /** True if at least one requested timeframe was dropped due to fetch failure. */
  partial: z.boolean(),
});
export type AnalyzeTechnicalOutput = z.infer<typeof AnalyzeTechnicalOutputSchema>;
