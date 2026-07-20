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

/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  GetSystemDiagnosticsInputSchema,
  GetSystemDiagnosticsOutputSchema,
  type GetSystemDiagnosticsOutput,
} from '@hamafx/shared';
import { schema } from '@hamafx/db';
import { getDb } from '../db';
import { tool } from 'ai';
import { desc, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { getToolContext, maybeGetToolContext } from '../tool-context';

const InputSchema = GetSystemDiagnosticsInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_system_diagnostics: { input: z.infer<typeof InputSchema> };
  }
}

export const getSystemDiagnosticsTool = tool({
  description:
    'Query the real-time operational health, connection latency, database record volumes, active synchronized files status, remaining daily budget, and verified environment variables in the Copilot system.',
  inputSchema: InputSchema,
  execute: async ({ verbose, forceProbe }): Promise<GetSystemDiagnosticsOutput> => {
    const db = maybeGetToolContext()?.db ?? getDb();
    const ctx = getToolContext();

    const dbStart = Date.now();
    let dbStatus: 'connected' | 'error' = 'connected';
    let latencyMs = 0;

    let journalEntriesCount = 0;
    let snapshotsCount = 0;
    let briefingsCount = 0;
    let resonanceCount = 0;
    let memoryEmbeddingsCount = 0;

    try {
      // Fetch table counts
      const counts = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(schema.journalEntries),
        db.select({ count: sql<number>`count(*)` }).from(schema.snapshots),
        db.select({ count: sql<number>`count(*)` }).from(schema.briefingsEmitted),
        db.select({ count: sql<number>`count(*)` }).from(schema.intermarketResonance),
        db.select({ count: sql<number>`count(*)` }).from(schema.memoryEmbeddings),
      ]);

      latencyMs = Date.now() - dbStart;
      journalEntriesCount = Number(counts[0]?.[0]?.count ?? 0);
      snapshotsCount = Number(counts[1]?.[0]?.count ?? 0);
      briefingsCount = Number(counts[2]?.[0]?.count ?? 0);
      resonanceCount = Number(counts[3]?.[0]?.count ?? 0);
      memoryEmbeddingsCount = Number(counts[4]?.[0]?.count ?? 0);
    } catch (err) {
      dbStatus = 'error';
      latencyMs = -1;
    }

    // Check last sync runs
    let resonanceSyncLastRun: string | null = null;
    let cotSyncLastRun: string | null = null;
    try {
      const resonanceRecent = await db
        .select({ date: schema.intermarketResonance.date })
        .from(schema.intermarketResonance)
        .orderBy(desc(schema.intermarketResonance.date))
        .limit(1);
      resonanceSyncLastRun = resonanceRecent[0]?.date ?? null;

      const cotRecent = await db
        .select({ occurredAt: schema.briefingsEmitted.createdAt })
        .from(schema.briefingsEmitted)
        .orderBy(desc(schema.briefingsEmitted.createdAt))
        .limit(1);
      cotSyncLastRun = cotRecent[0]?.occurredAt ? cotRecent[0].occurredAt.toISOString().slice(0, 10) : null;
    } catch {
      // best-effort
    }

    // Verify key environment parameters
    const envCheck: Record<string, boolean> = {
      FRED_API_KEY: !!process.env['FRED_API_KEY'],
      GOOGLE_GENERATIVE_AI_API_KEY: !!process.env['GOOGLE_GENERATIVE_AI_API_KEY'],
      GOOGLE_VERTEX_PROJECT: !!process.env['GOOGLE_VERTEX_PROJECT'],
      DATABASE_URL: !!process.env['DATABASE_URL'],
    };

    // Calculate budget statistics
    const limitUsd = ctx.budget?.max ?? 10.0;
    const spentUsd = ctx.budget?.spent ?? 0.0;
    const remainingUsd = Math.max(0, limitUsd - spentUsd);

    const isHealthy =
      dbStatus === 'connected' &&
      latencyMs < 250 &&
      envCheck.FRED_API_KEY &&
      envCheck.GOOGLE_GENERATIVE_AI_API_KEY;

    const status: GetSystemDiagnosticsOutput['status'] = !isHealthy
      ? 'degraded'
      : dbStatus === 'error'
        ? 'unhealthy'
        : 'healthy';

    const narrative = `System status is ${status.toUpperCase()}. DB latency: ${latencyMs}ms. Table stats: ${journalEntriesCount} journals, ${snapshotsCount} market snapshots, ${resonanceCount} macro intermarket rows, ${memoryEmbeddingsCount} vectorized memories. Remaining daily AI spend budget is $${remainingUsd.toFixed(2)} USD out of a cap of $${limitUsd.toFixed(2)} USD.`;

    return {
      status,
      asOf: new Date().toISOString(),
      database: {
        status: dbStatus,
        latencyMs,
        journalEntriesCount,
        snapshotsCount,
        briefingsCount,
        resonanceCount,
        memoryEmbeddingsCount,
      },
      worker: {
        resonanceSyncLastRun,
        cotSyncLastRun,
        activeAlertsCount: 0, // Placeholder alert counter
      },
      budget: {
        spentUsd,
        limitUsd,
        remainingUsd,
      },
      envCheck,
      narrative,
    };
  },
});
