import { getCandlesWithMeta } from '@kestrel/data';
import { AnalyzeTechnicalInputSchema, AnalyzeTechnicalOutputSchema } from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { computeTechnicalReading, deterministicSummary } from '../tools/analyze-technical';
import { createEvidenceId } from './evidence';
import { candleEvidenceMetadata, type CandleEvidenceMetadata } from './legacy-tool-adapter';
import { executeMastraTool } from './telemetry';
import { XauusdSymbolSchema } from './tool-schemas';
import { XAUUSD } from './types';

const CANDLE_COUNT = 200;

const InputSchema = AnalyzeTechnicalInputSchema.extend({
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
  data: AnalyzeTechnicalOutputSchema,
});

interface TechnicalReadingWithMetadata {
  reading: ReturnType<typeof computeTechnicalReading>;
  metadata: CandleEvidenceMetadata;
}

export const xauusdTechnicalAnalysisTool = createTool({
  id: 'analyze-xauusd-technical',
  description:
    'Read deterministic multi-timeframe XAUUSD technical analysis: trend, bias, RSI, MACD, structure, pivot levels, and ATR. Use for a narrow technical follow-up when the bounded research packet does not answer the requested timeframe detail.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ symbol, timeframes }, context) =>
    executeMastraTool('analyze-xauusd-technical', context, async () => {
      const readings = await Promise.all(
        timeframes.map(async (tf): Promise<TechnicalReadingWithMetadata | null> => {
          try {
            const candles = await getCandlesWithMeta(symbol, tf, {
              count: CANDLE_COUNT,
              ...(context.abortSignal ? { signal: context.abortSignal } : {}),
            });
            return {
              reading: computeTechnicalReading({ symbol, tf, candles: candles.candles }),
              metadata: candleEvidenceMetadata(candles, CANDLE_COUNT),
            };
          } catch {
            return null;
          }
        }),
      );
      const available = readings.filter(
        (entry): entry is TechnicalReadingWithMetadata => entry !== null && entry.reading !== null,
      );
      const perTimeframe = available.map((entry) => entry.reading!);
      const partial = available.length < timeframes.length;
      const metadata = mergeTechnicalMetadata(readings, partial);
      const data = {
        symbol,
        asOf: Date.now(),
        perTimeframe,
        summary: deterministicSummary({ symbol, perTimeframe, partial }),
        partial,
      };

      return OutputSchema.parse({
        evidenceId: createEvidenceId('technical-analysis', symbol),
        symbol,
        ...metadata,
        data,
      });
    }),
});

function mergeTechnicalMetadata(
  readings: Array<TechnicalReadingWithMetadata | null>,
  partial: boolean,
): CandleEvidenceMetadata {
  const metadata = readings
    .filter((entry): entry is TechnicalReadingWithMetadata => entry !== null)
    .map((entry) => entry.metadata);
  const warnings = [
    ...(partial ? ['One or more requested timeframes were unavailable'] : []),
    ...metadata.flatMap((entry) => entry.warnings),
  ];
  const uniqueWarnings = [...new Set(warnings)];
  const latest = metadata.reduce<CandleEvidenceMetadata | null>(
    (current, entry) => (current === null || entry.dataAsOf > current.dataAsOf ? entry : current),
    null,
  );
  const sources = [
    ...new Set(metadata.map((entry) => entry.source).filter((source) => source !== 'unknown')),
  ];

  return {
    source: sources.join(',') || 'unknown',
    fetchedAt:
      metadata
        .map((entry) => entry.fetchedAt)
        .sort()
        .at(-1) ?? new Date().toISOString(),
    dataAsOf: latest?.dataAsOf ?? new Date().toISOString(),
    freshness: metadata.some((entry) => entry.freshness === 'stale')
      ? 'stale'
      : metadata.length > 0 && metadata.every((entry) => entry.freshness === 'fresh')
        ? 'fresh'
        : 'unknown',
    quality: uniqueWarnings.length === 0 ? 'complete' : 'degraded',
    warnings: uniqueWarnings,
  };
}

export {
  InputSchema as XauusdTechnicalAnalysisInputSchema,
  OutputSchema as XauusdTechnicalAnalysisOutputSchema,
};
