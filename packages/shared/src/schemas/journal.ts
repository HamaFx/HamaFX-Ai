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
  /** Uploaded chart screenshot URL. */
  screenshotUrl: z.string().nullable().optional(),
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
  /**
   * Phase B — UX_UPGRADE_PLAN.md item 13.
   * Optional extended metrics. Older callers (pre-Phase B) may
   * not produce these — the chat UI handles the absence
   * gracefully (renders — instead of a value).
   */
  maxDrawdown: z.number().optional(),
  longestWinStreak: z.number().int().optional(),
  longestLossStreak: z.number().int().optional(),
  profitFactor: z.number().nullable().optional(),
  avgHoldMs: z.number().optional(),
  perDayOfWeek: z
    .object({
      sunday: z.number(),
      monday: z.number(),
      tuesday: z.number(),
      wednesday: z.number(),
      thursday: z.number(),
      friday: z.number(),
      saturday: z.number(),
    })
    .optional(),
  // Phase 2 — rich journal analytics suite.
  avgWinR: z.number().optional(),
  avgLossR: z.number().optional(),
  maxWinStreak: z.number().int().optional(),
  maxLossStreak: z.number().int().optional(),
  currentStreak: z
    .object({
      type: z.enum(['win', 'loss', 'none']),
      count: z.number().int(),
    })
    .optional(),
  recoveryFactor: z.number().optional(),
  rDistribution: z
    .array(
      z.object({
        bucket: z.string(),
        count: z.number().int(),
      }),
    )
    .optional(),
  bySymbol: z
    .array(
      z.object({
        symbol: z.string(),
        trades: z.number().int(),
        winRate: z.number(),
        totalR: z.number(),
        expectancy: z.number(),
      }),
    )
    .optional(),
  bySession: z
    .array(
      z.object({
        session: z.string(),
        trades: z.number().int(),
        winRate: z.number(),
        totalR: z.number(),
      }),
    )
    .optional(),
  byHour: z
    .array(
      z.object({
        hour: z.number().int(),
        trades: z.number().int(),
        winRate: z.number(),
        totalR: z.number(),
      }),
    )
    .optional(),
  byDayOfWeek: z
    .array(
      z.object({
        day: z.string(),
        trades: z.number().int(),
        winRate: z.number(),
        totalR: z.number(),
      }),
    )
    .optional(),
  byTag: z
    .array(
      z.object({
        tag: z.string(),
        trades: z.number().int(),
        winRate: z.number(),
        totalR: z.number(),
        expectancy: z.number(),
      }),
    )
    .optional(),
});
export type JournalStats = z.infer<typeof JournalStatsSchema>;
