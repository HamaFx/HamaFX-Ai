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

// Output envelope returned by the `get_intermarket` AI tool.
//
// Cross-asset pulse for the three supported pairs: a USD-strength proxy,
// a gold/risk pulse derived from XAU vs DXY, and a regime flag that
// fires when the typical XAU↔DXY anti-correlation breaks down. The
// `notes` string captures the deterministic interpretation so the agent
// can echo it without re-deriving.
//
// Source of truth: packages/ai/src/tools/get-intermarket.ts execute() return type.

import { z } from 'zod';

import { TimeframeSchema } from '../../timeframes';

export const RiskRegimeSchema = z.enum(['risk-on', 'risk-off', 'neutral']);
export type RiskRegime = z.infer<typeof RiskRegimeSchema>;

export const GetIntermarketInputSchema = z.object({
  /** Bar timeframe used for the correlation + change windows. */
  tf: TimeframeSchema.default('1h'),
  /** Window length in bars. */
  windowBars: z.number().int().min(20).max(500).default(100),
});
export type GetIntermarketInput = z.infer<typeof GetIntermarketInputSchema>;

export const GetIntermarketOutputSchema = z.object({
  asOf: z.number().int(),
  tf: TimeframeSchema,
  windowBars: z.number().int(),
  /** USD-strength proxy snapshot — same formula as `get_correlation`. */
  dxyProxy: z.object({
    value: z.number(),
    change24h: z.number(),
    formula: z.string(),
  }),
  /** Gold pulse: 24-hour percent change of XAUUSD, signed. */
  goldChange24h: z.number().nullable(),
  /** Pearson correlation between XAUUSD and the DXY proxy in the window. */
  xauDxyCorrelation: z.number(),
  /**
   * High-level regime tag. Derived from {dxyProxy.change24h, goldChange24h}:
   *   - dxy down + xau up + eu/gu up           → risk-on
   *   - dxy up + xau down + eu/gu down         → risk-off
   *   - mixed signals or |moves| < threshold   → neutral
   */
  regime: RiskRegimeSchema,
  /**
   * True when XAU/DXY correlation has flipped sign vs its long-run prior
   * (negative). A regime break is a useful caveat to surface in answers.
   */
  regimeBreak: z.boolean(),
  /** One-paragraph deterministic interpretation. */
  notes: z.string(),
  /** True when one or more inputs were unavailable. */
  partial: z.boolean(),
});
export type GetIntermarketOutput = z.infer<typeof GetIntermarketOutputSchema>;
