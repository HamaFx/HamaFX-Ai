import { z } from 'zod';

const ScenarioSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  trigger: z.string().min(1),
  invalidation: z.string().min(1),
  targets: z.array(z.string()),
  risks: z.array(z.string()).min(1),
});

const ReportSchema = z.object({
  symbol: z.literal('XAUUSD'),
  asOf: z.string().datetime(),
  dataQuality: z.enum(['complete', 'partial', 'degraded']),
  bias: z.enum(['bullish', 'bearish', 'neutral', 'unclear']),
  confidence: z.number().min(0).max(1),
  regime: z.string().min(1),
  bottomLine: z.string().min(1),
  technicalSummary: z.string().min(1),
  fundamentalSummary: z.string().min(1),
  scenarios: z.array(ScenarioSchema).min(2).max(3),
  contradictions: z.array(z.string()),
  missingData: z.array(z.string()),
  sources: z.array(z.object({
    evidenceId: z.string().min(1),
    source: z.string().min(1),
    dataAsOf: z.string().datetime(),
  })).min(1),
});

export const MastraReportMetaSchema = z.object({
  agent: z.literal('mastra-xauusd'),
  runId: z.string().min(1),
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  researchStatus: z.enum(['ready', 'blocked']),
  dataQuality: z.enum(['complete', 'partial', 'degraded']),
  packetId: z.string().min(1),
  observedCost: z.number().finite().nonnegative(),
  report: ReportSchema.nullable(),
});

export type MastraReportMetaView = z.infer<typeof MastraReportMetaSchema>;
export type MastraReportView = z.infer<typeof ReportSchema>;
export type MastraScenarioView = z.infer<typeof ScenarioSchema>;
