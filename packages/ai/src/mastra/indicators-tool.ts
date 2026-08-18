import { createTool } from '@mastra/core/tools';
import { getCandlesWithMeta } from '@kestrel/data';

import { buildIndicatorsEvidence } from './evidence-builders';
import { executeMastraTool } from './telemetry';
import { XauusdIndicatorsEvidenceSchema } from './types';
import { XauusdIndicatorsInputSchema } from './tool-schemas';

export const xauusdIndicatorsTool = createTool({
  id: 'get-xauusd-indicators',
  description: 'Compute XAUUSD indicators from one candle window and return recent values with evidence metadata.',
  inputSchema: XauusdIndicatorsInputSchema,
  outputSchema: XauusdIndicatorsEvidenceSchema,
  execute: async ({ symbol, timeframe, count, indicators }, context) =>
    executeMastraTool('get-xauusd-indicators', context, async () => {
      const result = await getCandlesWithMeta(symbol, timeframe, {
        count,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      return buildIndicatorsEvidence(timeframe, count, result, indicators);
    }),
});
