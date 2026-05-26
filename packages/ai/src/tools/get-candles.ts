// Tool: get_candles.
//
// Returns OHLC bars for a (symbol, tf) window. Callers should prefer
// `get_indicators` when they only need derived values — it's smaller in
// the prompt and the model can't accidentally hallucinate over noisy bars.

import { tool } from 'ai';
import { z } from 'zod';

import { getCandles } from '@hamafx/data';
import { type GetCandlesOutput, SymbolSchema, TimeframeSchema } from '@hamafx/shared';

const InputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  /** Bars to fetch. Cap kept tight — the model rarely benefits from >200. */
  count: z.number().int().min(10).max(500).default(120),
});

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_candles: { input: z.infer<typeof InputSchema> };
  }
}

export const getCandlesTool = tool({
  description:
    'Fetch OHLC candles for one symbol at one timeframe (e.g. XAUUSD 1h). Use to confirm a recent swing high/low or to feed a pattern read. For RSI/MACD/EMA/etc. prefer get_indicators.',
  inputSchema: InputSchema,
  execute: async ({ symbol, tf, count }): Promise<GetCandlesOutput> => {
    const candles = await getCandles(symbol, tf, { count });
    return { symbol, tf, candles };
  },
});
