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

// Output envelope returned by the `get_journal_stats` AI tool. Reuses the
// shared `JournalStatsSchema` for the global block and adds per-symbol +
// per-tag breakdowns derived from SQL group-bys.
//
// Source of truth: packages/ai/src/tools/get-journal-stats.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { JournalStatsSchema, TradeSideSchema } from '../journal';

export const GetJournalStatsInputSchema = z.object({
  /** ms epoch lower bound on `openedAt`. */
  sinceMs: z.number().int().optional(),
  /** ms epoch upper bound on `openedAt`. */
  untilMs: z.number().int().optional(),
  symbol: SymbolSchema.optional(),
  side: TradeSideSchema.optional(),
});
export type GetJournalStatsInput = z.infer<typeof GetJournalStatsInputSchema>;

export const StatBreakdownSchema = z.object({
  /** The bucket key — symbol code or tag string. */
  key: z.string(),
  count: z.number().int().min(0),
  /** [0, 1]; closed trades only. 0 when count is 0. */
  winRate: z.number().min(0).max(1),
  avgR: z.number(),
});
export type StatBreakdown = z.infer<typeof StatBreakdownSchema>;

export const GetJournalStatsOutputSchema = z.object({
  stats: JournalStatsSchema,
  bySymbol: z.array(StatBreakdownSchema),
  byTag: z.array(StatBreakdownSchema),
});
export type GetJournalStatsOutput = z.infer<typeof GetJournalStatsOutputSchema>;
