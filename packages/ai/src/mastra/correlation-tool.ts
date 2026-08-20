import { GetCorrelationInputSchema, GetCorrelationOutputSchema } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getCorrelationTool } from '../tools/get-correlation';
import { createEvidenceId } from './evidence';
import { executeLegacyReadOnlyTool } from './legacy-tool-adapter';
import { executeMastraTool } from './telemetry';
import { XAUUSD } from './types';

const InputSchema = GetCorrelationInputSchema;
const OutputSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: z.literal(XAUUSD),
  source: z.literal('kestrel-deterministic-intermarket'),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: z.literal('unknown'),
  quality: z.literal('degraded'),
  warnings: z.array(z.string()),
  data: GetCorrelationOutputSchema,
});

export const xauusdCorrelationTool = createTool({
  id: 'get-xauusd-correlation',
  description:
    'Read the deterministic XAUUSD/EURUSD/GBPUSD correlation matrix and two-leg DXY proxy. Use for a narrow intermarket or dollar-correlation question. The DXY value is explicitly a proxy, not the full index.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ tf, windowBars }, context) =>
    executeMastraTool('get-xauusd-correlation', context, async () => {
      const data = await executeLegacyReadOnlyTool<z.infer<typeof GetCorrelationOutputSchema>>(
        getCorrelationTool,
        { tf, windowBars },
        context.abortSignal,
      );
      const warnings = [
        'The composite legacy tool does not expose per-symbol provider freshness metadata',
        'The DXY value is a two-leg proxy, not the full DXY index',
      ];

      return OutputSchema.parse({
        evidenceId: createEvidenceId('correlation', XAUUSD, tf),
        symbol: XAUUSD,
        source: 'kestrel-deterministic-intermarket',
        fetchedAt: new Date(data.asOf).toISOString(),
        dataAsOf: new Date(data.asOf).toISOString(),
        freshness: 'unknown',
        quality: 'degraded',
        warnings,
        data,
      });
    }),
});

export {
  InputSchema as XauusdCorrelationInputSchema,
  OutputSchema as XauusdCorrelationOutputSchema,
};
