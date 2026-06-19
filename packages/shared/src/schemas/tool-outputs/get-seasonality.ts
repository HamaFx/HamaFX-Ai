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

// Output envelope returned by the `get_seasonality` AI tool.
//
// Per-month / per-weekday / per-hour return distributions derived from
// the last 3 years of daily candles for monthly + weekday, and the last
// 90 days of 1H candles for hourly. Buckets are sorted in their natural
// chronological order.
//
// Source of truth: packages/ai/src/tools/get-seasonality.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';

export const SeasonalityGranularitySchema = z.enum(['month', 'weekday', 'hour']);
export type SeasonalityGranularity = z.infer<typeof SeasonalityGranularitySchema>;

export const GetSeasonalityInputSchema = z.object({
  symbol: SymbolSchema,
  granularity: SeasonalityGranularitySchema.default('month'),
});
export type GetSeasonalityInput = z.infer<typeof GetSeasonalityInputSchema>;

export const SeasonalityBucketSchema = z.object({
  /**
   * Bucket key:
   *  - `month`:   1..12 (Jan = 1)
   *  - `weekday`: 0..6  (Sun = 0)
   *  - `hour`:    0..23
   */
  key: z.number().int(),
  /** Human-readable label, e.g. "Mar", "Mon", "13:00 UTC". */
  label: z.string(),
  /** Number of samples in the bucket. */
  count: z.number().int(),
  /** Median percent return across samples. */
  medianReturnPct: z.number(),
  /** 25th percentile percent return. */
  q1Pct: z.number(),
  /** 75th percentile percent return. */
  q3Pct: z.number(),
  /** Fraction of samples with positive return, 0..1. */
  winRate: z.number().min(0).max(1),
});
export type SeasonalityBucket = z.infer<typeof SeasonalityBucketSchema>;

export const GetSeasonalityOutputSchema = z.object({
  symbol: SymbolSchema,
  granularity: SeasonalityGranularitySchema,
  asOf: z.number().int(),
  buckets: z.array(SeasonalityBucketSchema),
  /** Number of bars used to derive the buckets. */
  sampleSize: z.number().int(),
  /** True when fewer than 30 samples were available — buckets are noisy. */
  thin: z.boolean(),
});
export type GetSeasonalityOutput = z.infer<typeof GetSeasonalityOutputSchema>;
