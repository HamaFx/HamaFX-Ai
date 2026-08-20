import { getCandlesWithMeta } from '@kestrel/data';
import { createTool } from '@mastra/core/tools';

import { buildCandlesEvidence } from './evidence-builders';
import { executeMastraTool } from './telemetry';
import { XauusdCandlesInputSchema } from './tool-schemas';
import { XauusdCandlesEvidenceSchema } from './types';

export const xauusdCandlesTool = createTool({
  id: 'get-xauusd-candles',
  description: 'Fetch XAUUSD OHLC candles for one timeframe with source and freshness metadata.',
  inputSchema: XauusdCandlesInputSchema,
  outputSchema: XauusdCandlesEvidenceSchema,
  execute: async ({ symbol, timeframe, count }, context) =>
    executeMastraTool('get-xauusd-candles', context, async () => {
      const result = await getCandlesWithMeta(symbol, timeframe, {
        count,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      return buildCandlesEvidence(timeframe, count, result);
    }),
});
