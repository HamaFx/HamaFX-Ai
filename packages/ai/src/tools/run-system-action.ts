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

import {
  RunSystemActionInputSchema,
  type RunSystemActionOutput,
  forbidden,
} from '@hamafx/shared';
import { fred } from '@hamafx/data';
import { schema } from '@hamafx/db';
import { getDb } from '../db';
import { tool } from 'ai';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { z } from 'zod';

import { getToolContext, maybeGetToolContext } from '../tool-context';
import { assertMutationIntent } from './mutation-guard';

const InputSchema = RunSystemActionInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    run_system_action: { input: z.infer<typeof InputSchema> };
  }
}

async function assertOperatorRole(userId: string): Promise<void> {
  const db = maybeGetToolContext()?.db ?? getDb();
  const [caller] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  if (caller?.role !== 'admin') {
    throw forbidden('run_system_action is restricted to operator/admin accounts.');
  }
}

export const runSystemActionTool = tool({
  description:
    'Trigger the operator-only FRED resonance historical sync. This tool is only for explicit user requests to run the resonance backfill/sync and is unavailable for canned cache or migration theatrics.',
  inputSchema: InputSchema,
  execute: async ({ action }): Promise<RunSystemActionOutput> => {
    const ctx = getToolContext();
    assertMutationIntent('run_system_action', { action });
    await assertOperatorRole(ctx.userId);

    const startedAt = Date.now();
    const consoleLogs: string[] = [];
    const db = maybeGetToolContext()?.db ?? getDb();

    consoleLogs.push(`[devops] Initiating action: ${action.toUpperCase()}`);
    consoleLogs.push(`[devops] Thread ID: ${ctx.threadId}`);
    consoleLogs.push('[devops] Caller role verified: admin');

    let status: 'success' | 'error' = 'success';
    let message = '';

    try {
      const apiKey = process.env['FRED_API_KEY'];
      if (!apiKey) {
        throw new Error('FRED_API_KEY environment variable is not configured.');
      }

      consoleLogs.push('[resonance-sync] Fetching historical observations from FRED (last 45 days)...');
      const today = new Date();
      const endDateStr = today.toISOString().slice(0, 10);
      const startDate = new Date();
      startDate.setUTCDate(today.getUTCDate() - 45);
      const startDateStr = startDate.toISOString().slice(0, 10);

      const rawInputs = await fred.fetchResonanceInputs({
        apiKey,
        start: startDateStr,
        end: endDateStr,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });

      consoleLogs.push(
        `[resonance-sync] Received ${rawInputs.realYields.length} Real Yield and ${rawInputs.breakevenInflation.length} Breakeven Inflation records.`,
      );

      const yieldsMap = new Map<string, number>();
      for (const observation of rawInputs.realYields) {
        yieldsMap.set(observation.date, observation.value);
      }

      const inflationMap = new Map<string, number>();
      for (const observation of rawInputs.breakevenInflation) {
        inflationMap.set(observation.date, observation.value);
      }

      consoleLogs.push('[resonance-sync] Querying daily Gold close snapshots from database...');
      const goldSnapshots = await db
        .select()
        .from(schema.snapshots)
        .where(
          and(
            eq(schema.snapshots.symbol, 'XAUUSD'),
            eq(schema.snapshots.kind, 'daily'),
            gte(schema.snapshots.asOf, startDate),
            lte(schema.snapshots.asOf, today),
          ),
        );

      const goldMap = new Map<string, number>();
      for (const snapshot of goldSnapshots) {
        const dateStr = snapshot.asOf.toISOString().slice(0, 10);
        const data = snapshot.data as { close?: number };
        if (typeof data.close === 'number') {
          goldMap.set(dateStr, data.close);
        }
      }
      consoleLogs.push(`[resonance-sync] Loaded ${goldMap.size} Gold daily close records.`);

      const aligned: Array<{
        date: string;
        realYield: number;
        inflation: number;
        gold: number;
      }> = [];

      for (const [dateStr, realYield] of yieldsMap.entries()) {
        const inflation = inflationMap.get(dateStr);
        const gold = goldMap.get(dateStr);
        if (inflation !== undefined && gold !== undefined) {
          aligned.push({ date: dateStr, realYield, inflation, gold });
        }
      }

      consoleLogs.push(`[resonance-sync] Aligned ${aligned.length} business-day observations.`);

      if (aligned.length < 5) {
        throw new Error(
          `Insufficient aligned data points (aligned=${aligned.length}) to execute linear regression.`,
        );
      }

      consoleLogs.push('[resonance-sync] Computing Ordinary Least Squares (OLS) regression baseline...');
      const n = aligned.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      for (const point of aligned) {
        sumX += point.realYield;
        sumY += point.gold;
        sumXY += point.realYield * point.gold;
        sumXX += point.realYield * point.realYield;
      }

      const denominator = n * sumXX - sumX * sumX;
      let slope = 0;
      let intercept = 0;
      if (denominator !== 0) {
        slope = (n * sumXY - sumX * sumY) / denominator;
        intercept = (sumY - slope * sumX) / n;
      } else {
        intercept = sumY / n;
      }

      const residuals: number[] = [];
      for (const point of aligned) {
        residuals.push(point.gold - (intercept + slope * point.realYield));
      }

      const meanResidual = residuals.reduce((sum, residual) => sum + residual, 0) / n;
      const varianceResidual =
        residuals.reduce((sum, residual) => sum + Math.pow(residual - meanResidual, 2), 0) / n;
      const stdDevResidual = Math.sqrt(varianceResidual) || 1;

      consoleLogs.push(
        `[resonance-sync] OLS formula: ExpectedGold = ${intercept.toFixed(1)} + (${slope.toFixed(2)} * RealYield)`,
      );
      consoleLogs.push(
        `[resonance-sync] Residual Standard Deviation: ${stdDevResidual.toFixed(2)} USD`,
      );

      consoleLogs.push(
        '[resonance-sync] Writing synchronized observations to DB intermarket_resonance table...',
      );
      let upsertedCount = 0;

      for (const point of aligned) {
        const expected = intercept + slope * point.realYield;
        const residual = point.gold - expected;
        const divergenceScore = residual / stdDevResidual;

        await db
          .insert(schema.intermarketResonance)
          .values({
            date: point.date,
            realYieldPct: point.realYield,
            breakevenInflationPct: point.inflation,
            dxyIndex: 100,
            goldClose: point.gold,
            divergenceScore,
            createdAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.intermarketResonance.date,
            set: {
              realYieldPct: sql`excluded.real_yield_pct`,
              breakevenInflationPct: sql`excluded.breakeven_inflation_pct`,
              dxyIndex: sql`excluded.dxy_index`,
              goldClose: sql`excluded.gold_close`,
              divergenceScore: sql`excluded.divergence_score`,
              createdAt: sql`now()`,
            },
          });
        upsertedCount += 1;
      }

      consoleLogs.push(`[resonance-sync] Successfully upserted ${upsertedCount} observations.`);
      message =
        'Intermarket resonance database sync successfully executed. ' +
        `Refreshed ${upsertedCount} daily macro-divergence records.`;
    } catch (err) {
      status = 'error';
      const errMsg = err instanceof Error ? err.message : String(err);
      consoleLogs.push(`[error] Action failed: ${errMsg}`);
      message = `DevOps action execution failed: ${errMsg}`;
    }

    const executionTimeMs = Date.now() - startedAt;
    consoleLogs.push(`[devops] Action finished with status ${status.toUpperCase()} in ${executionTimeMs}ms`);

    return {
      action,
      status,
      consoleLogs,
      executionTimeMs,
      message,
    };
  },
});
