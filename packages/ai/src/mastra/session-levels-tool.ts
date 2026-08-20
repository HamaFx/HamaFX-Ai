import { getCandlesWithMeta } from '@kestrel/data';
import { GetSessionLevelsInputSchema, GetSessionLevelsOutputSchema } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { computeSessionLevels } from '../tools/get-session-levels';
import { createEvidenceId } from './evidence';
import { candleEvidenceMetadata } from './legacy-tool-adapter';
import { executeMastraTool } from './telemetry';
import { XauusdSymbolSchema } from './tool-schemas';
import { XAUUSD } from './types';

const CANDLE_COUNT = 60;

const InputSchema = GetSessionLevelsInputSchema.extend({
  symbol: XauusdSymbolSchema,
});

const OutputSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: z.literal(XAUUSD),
  source: z.string().min(1),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  quality: z.enum(['complete', 'partial', 'degraded']),
  warnings: z.array(z.string()),
  data: GetSessionLevelsOutputSchema,
});

export const xauusdSessionLevelsTool = createTool({
  id: 'get-xauusd-session-levels',
  description:
    'Read today and optionally yesterday’s Asia, London, and New York XAUUSD session levels. Use for a narrow intraday session question; the result includes forming-session flags.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ symbol, includePrior }, context) =>
    executeMastraTool('get-xauusd-session-levels', context, async () => {
      const candles = await getCandlesWithMeta(symbol, '1h', {
        count: CANDLE_COUNT,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      const metadata = candleEvidenceMetadata(candles, CANDLE_COUNT);
      const data = computeSessionLevels({
        symbol,
        includePrior,
        candles: candles.candles,
        nowMs: Date.now(),
      });

      return OutputSchema.parse({
        evidenceId: createEvidenceId('session-levels', symbol),
        symbol,
        ...metadata,
        data,
      });
    }),
});

export {
  InputSchema as XauusdSessionLevelsInputSchema,
  OutputSchema as XauusdSessionLevelsOutputSchema,
};
