import {
  CandleSchema,
  EconomicEventSchema,
  IndicatorResultSchema,
  NewsArticleSchema,
  SymbolSchema,
  TickSchema,
  TimeframeSchema,
} from '@kestrel/shared';
import { z } from 'zod';

export const XAUUSD = 'XAUUSD' as const;

export const XauusdRequestContextSchema = z.object({
  userId: z.string().min(1),
  runId: z.string().min(1),
  /** Optional for direct tool tests; production runs provide the chat thread. */
  threadId: z.string().min(1).optional(),
  /** Trusted server-created packet supplied to the synthesis model. */
  researchPacket: z.unknown().optional(),
  /** Optional prior verified report used only to explain a follow-up. */
  priorReport: z.unknown().optional(),
  /** User-scoped historical context; never current market evidence. */
  memoryContext: z.string().optional(),
});

export type XauusdRequestContext = z.infer<typeof XauusdRequestContextSchema>;

export const EvidenceFreshnessSchema = z.enum(['fresh', 'stale', 'unknown']);
export const EvidenceQualitySchema = z.enum(['complete', 'partial', 'degraded']);

export const EvidenceMetadataSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: SymbolSchema,
  timeframe: TimeframeSchema.optional(),
  source: z.string().min(1),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: EvidenceFreshnessSchema,
  quality: EvidenceQualitySchema,
  warnings: z.array(z.string()),
});

export const XauusdPriceEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('price'),
  symbol: z.literal(XAUUSD),
  data: z.object({
    tick: TickSchema,
    stale: z.boolean(),
    ageMs: z.number().nullable(),
  }),
});

export const XauusdCandlesEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('candles'),
  symbol: z.literal(XAUUSD),
  timeframe: TimeframeSchema,
  data: z.object({
    candles: z.array(CandleSchema),
    stale: z.boolean(),
    count: z.number().int().nonnegative(),
  }),
});

export const XauusdIndicatorsEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('indicators'),
  symbol: z.literal(XAUUSD),
  timeframe: TimeframeSchema,
  data: z.object({
    results: z.array(IndicatorResultSchema),
    candleCount: z.number().int().nonnegative(),
    stale: z.boolean(),
  }),
});

export const XauusdMacroEvidenceSchema = EvidenceMetadataSchema.extend({
  kind: z.literal('macro'),
  symbol: z.literal(XAUUSD),
  data: z.object({
    news: z.array(NewsArticleSchema),
    events: z.array(EconomicEventSchema),
    dollarIndex: z.array(z.object({ date: z.string(), value: z.number() })),
    realYields: z.array(z.object({ date: z.string(), value: z.number() })),
    breakevenInflation: z.array(z.object({ date: z.string(), value: z.number() })),
  }),
});

export type XauusdPriceEvidence = z.infer<typeof XauusdPriceEvidenceSchema>;
export type XauusdCandlesEvidence = z.infer<typeof XauusdCandlesEvidenceSchema>;
export type XauusdIndicatorsEvidence = z.infer<typeof XauusdIndicatorsEvidenceSchema>;
export type XauusdMacroEvidence = z.infer<typeof XauusdMacroEvidenceSchema>;
