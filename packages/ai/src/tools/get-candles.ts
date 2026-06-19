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

// Tool: get_candles.
//
// Returns OHLC bars for a (symbol, tf) window. Callers should prefer
// `get_indicators` when they only need derived values — it's smaller in
// the prompt and the model can't accidentally hallucinate over noisy bars.

import { getCandles } from '@hamafx/data';
import { SymbolSchema, TimeframeSchema, type GetCandlesOutput } from '@hamafx/shared';
import { tool } from 'ai';
import { z } from 'zod';

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
