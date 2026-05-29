import { z } from 'zod';

export const GetSystemDiagnosticsInputSchema = z.object({
  verbose: z.boolean().default(false),
  forceProbe: z.boolean().default(false),
});

export type GetSystemDiagnosticsInput = z.infer<typeof GetSystemDiagnosticsInputSchema>;

export const DatabaseStatsSchema = z.object({
  status: z.enum(['connected', 'error']),
  latencyMs: z.number(),
  journalEntriesCount: z.number(),
  snapshotsCount: z.number(),
  briefingsCount: z.number(),
  resonanceCount: z.number(),
  memoryEmbeddingsCount: z.number(),
});

export const WorkerStatsSchema = z.object({
  resonanceSyncLastRun: z.string().nullable(),
  cotSyncLastRun: z.string().nullable(),
  activeAlertsCount: z.number(),
});

export const BudgetStatsSchema = z.object({
  spentUsd: z.number(),
  limitUsd: z.number(),
  remainingUsd: z.number(),
});

export const GetSystemDiagnosticsOutputSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  asOf: z.string(),
  database: DatabaseStatsSchema,
  worker: WorkerStatsSchema,
  budget: BudgetStatsSchema,
  envCheck: z.record(z.string(), z.boolean()),
  narrative: z.string(),
});

export type GetSystemDiagnosticsOutput = z.infer<typeof GetSystemDiagnosticsOutputSchema>;
