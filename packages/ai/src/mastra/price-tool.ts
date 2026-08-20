import { getPriceWithMeta } from '@kestrel/data';
import { createTool } from '@mastra/core/tools';

import { buildPriceEvidence } from './evidence-builders';
import { executeMastraTool } from './telemetry';
import { XauusdPriceInputSchema } from './tool-schemas';
import { XauusdPriceEvidenceSchema } from './types';

export const xauusdPriceTool = createTool({
  id: 'get-xauusd-price',
  description: 'Fetch the latest XAUUSD mid price with source and freshness metadata.',
  inputSchema: XauusdPriceInputSchema,
  outputSchema: XauusdPriceEvidenceSchema,
  execute: async ({ symbol }, context) =>
    executeMastraTool('get-xauusd-price', context, async () => {
      const result = await getPriceWithMeta(symbol, {
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      return buildPriceEvidence(result);
    }),
});
