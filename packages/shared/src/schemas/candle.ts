import { z } from 'zod';
import { SymbolSchema } from '../symbols.js';
import { TimeframeSchema } from '../timeframes.js';

/**
 * Normalised OHLC candle. All providers map to this DTO at the adapter
 * boundary (packages/data/src/providers/<name>/map.ts).
 */
export const CandleSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Open time, ms epoch UTC. */
  t: z.number().int(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  /** Volume — nullable because FX volume is synthetic / per-broker. */
  v: z.number().nullable(),
  /** Provider that produced this candle, e.g. "twelve-data". */
  source: z.string(),
  /** When we fetched it, ms epoch UTC — drives freshness UI. */
  fetchedAt: z.number().int(),
});

export type Candle = z.infer<typeof CandleSchema>;
