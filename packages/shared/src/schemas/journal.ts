import { z } from 'zod';
import { SymbolSchema } from '../symbols.js';

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
