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

import { SymbolSchema } from '../symbols';
import { TimeframeSchema } from '../timeframes';

/** Identifiers for built-in indicators (packages/indicators). Keep stable. */
export const IndicatorKindSchema = z.enum([
  'sma',
  'ema',
  'rsi',
  'macd',
  'atr',
  'bollinger',
  'pivots',
]);
export type IndicatorKind = z.infer<typeof IndicatorKindSchema>;

/** Per-indicator parameter object — open-ended on purpose. Validated per-kind in `packages/indicators`. */
export const IndicatorParamsSchema = z.record(z.union([z.number(), z.string(), z.boolean()]));

export const IndicatorRequestSchema = z.object({
  kind: IndicatorKindSchema,
  params: IndicatorParamsSchema.default({}),
});
export type IndicatorRequest = z.infer<typeof IndicatorRequestSchema>;

/** Time-series result: one numeric value (or sub-series) per candle index. */
export const IndicatorSeriesValueSchema = z.union([
  z.number().nullable(),
  z.record(z.number().nullable()),
]);

export const IndicatorResultSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  kind: IndicatorKindSchema,
  params: IndicatorParamsSchema,
  /** Aligned 1:1 with the candle window the request was computed against. */
  values: z.array(IndicatorSeriesValueSchema),
  fetchedAt: z.number().int(),
});

export type IndicatorResult = z.infer<typeof IndicatorResultSchema>;
