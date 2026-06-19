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

// Output envelope returned by the `compute_position_health` AI tool.
//
// Joins open journal entries to live mid prices and emits per-position
// P/L in pips and R-multiples plus distances to stop / target. Flagged
// `aboutToHit` when |distance| ≤ 5 pips. Best-effort — a per-symbol
// price-fetch failure drops only that row and sets `partial: true`.
//
// Source of truth: packages/ai/src/tools/compute-position-health.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TradeSideSchema } from '../journal';

export const ComputePositionHealthInputSchema = z.object({
  /** Optional symbol filter; omit for all open positions. */
  symbol: SymbolSchema.optional(),
  /** Cap on rows returned. */
  limit: z.number().int().min(1).max(50).default(20),
});
export type ComputePositionHealthInput = z.infer<typeof ComputePositionHealthInputSchema>;

export const PositionHealthRowSchema = z.object({
  entryId: z.string().uuid(),
  symbol: SymbolSchema,
  side: TradeSideSchema,
  /** Trade open time, ms epoch UTC. */
  openedAtMs: z.number().int(),
  entry: z.number(),
  stop: z.number().nullable(),
  target: z.number().nullable(),
  /** Live mid at evaluation time. */
  currentMid: z.number(),
  /** Realized P/L vs entry, expressed in pips. */
  pnlPips: z.number(),
  /** Realized P/L in R-multiples (null when no stop). */
  pnlR: z.number().nullable(),
  /** Pips between current mid and stop (null when no stop). */
  distanceToStopPips: z.number().nullable(),
  /** Pips between current mid and target (null when no target). */
  distanceToTargetPips: z.number().nullable(),
  /** True if either |distance to stop| or |distance to target| ≤ 5 pips. */
  aboutToHit: z.boolean(),
});
export type PositionHealthRow = z.infer<typeof PositionHealthRowSchema>;

export const ComputePositionHealthOutputSchema = z.object({
  asOf: z.number().int(),
  rows: z.array(PositionHealthRowSchema),
  /** True when at least one open trade was skipped due to a price-fetch failure. */
  partial: z.boolean(),
  /** True when no open trades exist in the journal. */
  empty: z.boolean(),
});
export type ComputePositionHealthOutput = z.infer<typeof ComputePositionHealthOutputSchema>;
