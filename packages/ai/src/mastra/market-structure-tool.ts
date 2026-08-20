import { getCandlesWithMeta } from '@kestrel/data';
import {
  GetMarketStructureOutputSchema,
  StructureKindSchema,
  TimeframeSchema,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { computeMarketStructureOutput } from '../tools/get-market-structure';
import { createEvidenceId } from './evidence';
import { candleEvidenceMetadata } from './legacy-tool-adapter';
import { executeMastraTool } from './telemetry';
import { XauusdSymbolSchema } from './tool-schemas';
import { XAUUSD } from './types';

const InputSchema = z.object({
  symbol: XauusdSymbolSchema.default(XAUUSD),
  timeframe: TimeframeSchema,
  count: z.number().int().min(50).max(300).default(200),
  kinds: z.array(StructureKindSchema).min(1).max(5).optional(),
  lookback: z.number().int().min(2).max(10).default(3),
});

const OutputSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: z.literal(XAUUSD),
  timeframe: TimeframeSchema,
  source: z.string().min(1),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  quality: z.enum(['complete', 'partial', 'degraded']),
  warnings: z.array(z.string()),
  data: GetMarketStructureOutputSchema,
});

export const xauusdMarketStructureTool = createTool({
  id: 'get-xauusd-market-structure',
  description:
    'Read XAUUSD market structure for one timeframe: swings, BOS/CHoCH, fair-value gaps, order blocks, and liquidity sweeps. Use for a narrow structure follow-up, not as a replacement for the broad research packet.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ symbol, timeframe, count, kinds, lookback }, context) =>
    executeMastraTool('get-xauusd-market-structure', context, async () => {
      const candles = await getCandlesWithMeta(symbol, timeframe, {
        count,
        ...(context.abortSignal ? { signal: context.abortSignal } : {}),
      });
      const metadata = candleEvidenceMetadata(candles, count);
      const data = computeMarketStructureOutput({
        symbol,
        tf: timeframe,
        count,
        ...(kinds ? { kinds } : {}),
        lookback,
        candles: candles.candles,
      });

      return OutputSchema.parse({
        evidenceId: createEvidenceId('market-structure', symbol, timeframe),
        symbol,
        timeframe,
        ...metadata,
        data,
      });
    }),
});

export {
  InputSchema as XauusdMarketStructureInputSchema,
  OutputSchema as XauusdMarketStructureOutputSchema,
};
