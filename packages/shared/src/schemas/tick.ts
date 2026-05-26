import { z } from 'zod';
import { SymbolSchema } from '../symbols.js';

export const TickSchema = z.object({
  symbol: SymbolSchema,
  bid: z.number(),
  ask: z.number(),
  mid: z.number(),
  /** Tick timestamp, ms epoch UTC. */
  ts: z.number().int(),
  source: z.string(),
});

export type Tick = z.infer<typeof TickSchema>;
