import { getCandlesWithMeta } from '@kestrel/data';
import { createTool } from '@mastra/core/tools';

import { buildIndicatorsEvidence } from './evidence-builders';
import { executeMastraTool } from './telemetry';
import { XauusdIndicatorsInputSchema } from './tool-schemas';
import { XauusdIndicatorsEvidenceSchema } from './types';

export const xauusdIndicatorsTool = createTool({
  id: 'get-xauusd-indicators',
  description:
    'Compute XAUUSD indicators from one candle window and return recent values with evidence metadata.',
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
