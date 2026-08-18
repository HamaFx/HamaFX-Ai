import { z } from 'zod';

import { EvidenceQualitySchema } from './types';

const ScenarioSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  trigger: z.string().min(1),
  entryZone: z.string().min(1).optional(),
  invalidation: z.string().min(1),
  targets: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
});

const SourceSchema = z.object({
  evidenceId: z.string().min(1),
  source: z.string().min(1),
  dataAsOf: z.string().datetime(),
});

/** A numeric fact the model is explicitly claiming from one evidence item. */
const NumericClaimSchema = z.object({
  label: z.string().min(1),
  value: z.number().finite(),
  evidenceId: z.string().min(1),
  /** Optional rounding tolerance, capped to prevent broad unsupported claims. */
  tolerance: z.number().min(0).max(1).default(0.01),
});

export const XauusdResearchReportSchema = z.object({
  symbol: z.literal('XAUUSD'),
  asOf: z.string().datetime(),
  dataQuality: EvidenceQualitySchema,
  bias: z.enum(['bullish', 'bearish', 'neutral', 'unclear']),
  confidence: z.number().min(0).max(1),
  regime: z.string().min(1),
  bottomLine: z.string().min(1),
  technicalSummary: z.string().min(1),
  fundamentalSummary: z.string().min(1),
  scenarios: z.array(ScenarioSchema).min(2).max(3),
  contradictions: z.array(z.string()),
  missingData: z.array(z.string()),
  numericClaims: z.array(NumericClaimSchema).min(1).max(25),
  evidenceIds: z.array(z.string().min(1)).min(1),
  sources: z.array(SourceSchema).min(1),
});

export type XauusdResearchReport = z.infer<typeof XauusdResearchReportSchema>;
