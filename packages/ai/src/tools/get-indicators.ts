// Tool: get_indicators.
//
// Computes one or more indicators against the same candle window in a
// single call. Mirrors the /api/market/indicators route handler so the
// chart UI and the AI agent always see identical numbers.

import { tool } from 'ai';
import { z } from 'zod';

import { getCandles } from '@hamafx/data';
import { computeIndicator } from '@hamafx/indicators';
import {
  IndicatorKindSchema,
  IndicatorParamsSchema,
  SymbolSchema,
  TimeframeSchema,
  type IndicatorResult,
} from '@hamafx/shared';

const InputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  count: z.number().int().min(20).max(500).default(200),
  indicators: z
    .array(z.object({ kind: IndicatorKindSchema, params: IndicatorParamsSchema.default({}) }))
    .min(1)
    .max(6),
});

interface Output {
  symbol: string;
  tf: string;
  /**
   * For prompt-economy each indicator's `values` array is truncated to the
   * last 30 points — the model rarely needs more for "what's happening now".
   * The chart UI fetches the full series via /api/market/indicators.
   */
  results: Array<Omit<IndicatorResult, 'values'> & { values: IndicatorResult['values'] }>;
}

export type { Output as GetIndicatorsOutput };

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_indicators: { input: z.infer<typeof InputSchema>; output: Output };
  }
}

const TAIL_POINTS = 30;

export const getIndicatorsTool = tool({
  description:
    'Compute indicators (sma, ema, rsi, macd, atr, bollinger, pivots) on a (symbol, timeframe) window. Returns the last 30 points of each series — enough for "current value + recent slope" reasoning.',
  inputSchema: InputSchema,
  execute: async ({ symbol, tf, count, indicators }): Promise<Output> => {
    const candles = await getCandles(symbol, tf, { count });
    const results = indicators.map(({ kind, params }) => {
      const full = computeIndicator({ symbol, tf, kind, params, candles });
      return {
        ...full,
        values: full.values.slice(-TAIL_POINTS) as IndicatorResult['values'],
      };
    });
    return { symbol, tf, results };
  },
});
