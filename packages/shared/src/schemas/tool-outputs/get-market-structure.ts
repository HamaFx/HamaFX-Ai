// Output envelope returned by the `get_market_structure` AI tool. The tool
// tail-trims each event list and adds a `summary` prose field, so the
// envelope is bespoke (it is NOT `StructureResultSchema`). We reuse the
// per-event sub-schemas directly.
//
// Source of truth: packages/ai/src/tools/get-market-structure.ts execute()
// return type.

import { z } from 'zod';

import {
  FvgZoneSchema,
  LiquiditySweepSchema,
  OrderBlockSchema,
  StructureEventSchema,
  SwingPointSchema,
} from '../structure';

export const GetMarketStructureOutputSchema = z.object({
  symbol: z.string(),
  tf: z.string(),
  /** Number of candles the result was computed against. */
  bars: z.number().int().nonnegative(),
  swings: z.array(SwingPointSchema).optional(),
  events: z.array(StructureEventSchema).optional(),
  fvg: z.array(FvgZoneSchema).optional(),
  orderBlocks: z.array(OrderBlockSchema).optional(),
  liquidity: z.array(LiquiditySweepSchema).optional(),
  /** Compact human-readable summary the model can echo verbatim. */
  summary: z.string(),
});

export type GetMarketStructureOutput = z.infer<typeof GetMarketStructureOutputSchema>;
