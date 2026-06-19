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

export const TradeSideSchema = z.enum(['long', 'short']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const TradeOutcomeSchema = z.enum(['win', 'loss', 'breakeven', 'open']);
export type TradeOutcome = z.infer<typeof TradeOutcomeSchema>;

export const JournalEntrySchema = z.object({
  id: z.string().uuid(),
  symbol: SymbolSchema,
  side: TradeSideSchema,
  /** Trade open time, ms epoch UTC. */
  openedAt: z.number().int(),
  closedAt: z.number().int().nullable(),
  entry: z.number(),
  stop: z.number().nullable(),
  target: z.number().nullable(),
  exit: z.number().nullable(),
  /** Position size in lots; optional — many users journal without sizing. */
  size: z.number().nullable(),
  outcome: TradeOutcomeSchema,
  /** Realized R-multiple, computed when entry/exit/stop are known. */
  rMultiple: z.number().nullable(),
  notes: z.string().nullable(),
  tags: z.array(z.string()).default([]),
  /** Free-form attachments (Supabase Storage paths). */
  attachments: z.array(z.string()).default([]),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const JournalStatsSchema = z.object({
  count: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  breakevens: z.number().int(),
  open: z.number().int(),
  winRate: z.number().min(0).max(1),
  avgR: z.number(),
  totalR: z.number(),
});
export type JournalStats = z.infer<typeof JournalStatsSchema>;
