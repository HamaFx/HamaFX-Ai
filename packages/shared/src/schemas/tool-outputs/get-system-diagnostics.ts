/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
