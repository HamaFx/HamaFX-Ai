// Tool: get_market_structure.
//
// Lets the agent ask "what does structure look like on EURUSD 1h?" and
// get back swings, BOS/CHoCH events, fair-value gaps, order blocks, and
// liquidity sweeps in one round-trip. Outputs are sparse events (not
// per-candle scalars) so they live in their own envelope alongside the
// existing get_indicators tool.

import { tool } from 'ai';
import { z } from 'zod';

import { getCandles } from '@hamafx/data';
import { computeStructure } from '@hamafx/indicators';
import {
  type GetMarketStructureOutput,
  StructureKindSchema,
  type StructureResult,
  SymbolSchema,
  TimeframeSchema,
} from '@hamafx/shared';

const InputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Bars to scan. 300 covers ~12 days on 1h, 12 weeks on 4h. */
  count: z.number().int().min(50).max(1000).default(300),
  /**
   * Which kinds to compute. Skip the ones you don't need to keep the
   * payload small in the chat history.
   */
  kinds: z.array(StructureKindSchema).min(1).max(5).optional(),
  /** Swing-pivot strictness (k bars on each side). Higher = fewer, cleaner. */
  lookback: z.number().int().min(2).max(10).default(3),
});

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_market_structure: { input: z.infer<typeof InputSchema> };
  }
}

const TAIL = 30;

export const getMarketStructureTool = tool({
  description:
    'Detect SMC market structure on a (symbol, timeframe) window: swing pivots, break-of-structure / change-of-character events, fair value gaps, order blocks, and liquidity sweeps. Use when the user asks about trend bias, structural breaks, FVGs, OBs, or where stops likely got swept.',
  inputSchema: InputSchema,
  execute: async ({ symbol, tf, count, kinds, lookback }): Promise<GetMarketStructureOutput> => {
    const candles = await getCandles(symbol, tf, { count });
    const r = computeStructure({
      symbol,
      tf,
      candles,
      ...(kinds ? { kinds } : {}),
      swings: { lookback },
    });

    return {
      symbol,
      tf,
      bars: r.bars,
      ...(r.swings ? { swings: r.swings.slice(-TAIL) } : {}),
      ...(r.events ? { events: r.events.slice(-TAIL) } : {}),
      ...(r.fvg ? { fvg: r.fvg.filter((z) => !z.mitigated).slice(-TAIL) } : {}),
      ...(r.orderBlocks
        ? { orderBlocks: r.orderBlocks.filter((o) => !o.mitigated).slice(-TAIL) }
        : {}),
      ...(r.liquidity ? { liquidity: r.liquidity.slice(-TAIL) } : {}),
      summary: summarize(r),
    };
  },
});

/** Compact human-readable summary the model can echo without big-array reasoning. */
function summarize(r: StructureResult): string {
  const parts: string[] = [];
  if (r.swings) parts.push(`${r.swings.length} swings`);
  if (r.events && r.events.length > 0) {
    const lastEvent = r.events[r.events.length - 1]!;
    parts.push(
      `last structure: ${lastEvent.kind.toUpperCase()} ${lastEvent.direction} @ ${lastEvent.level}`,
    );
  } else if (r.events) {
    parts.push('no structure breaks');
  }
  if (r.fvg) {
    const open = r.fvg.filter((z) => !z.mitigated).length;
    parts.push(`${open}/${r.fvg.length} unmitigated FVGs`);
  }
  if (r.orderBlocks) {
    const open = r.orderBlocks.filter((o) => !o.mitigated).length;
    parts.push(`${open}/${r.orderBlocks.length} unmitigated OBs`);
  }
  if (r.liquidity) parts.push(`${r.liquidity.length} liquidity sweeps`);
  return parts.join(' · ');
}
