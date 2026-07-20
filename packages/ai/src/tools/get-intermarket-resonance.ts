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
  GetIntermarketResonanceInputSchema,
  GetIntermarketResonanceOutputSchema,
  type GetIntermarketResonanceOutput,
  type ResonanceObservation,
  type Symbol,
} from '@hamafx/shared';
import { getDb, schema } from '@hamafx/db';
import { tool } from 'ai';
import { desc } from 'drizzle-orm';
import type { z } from 'zod';

import { maybeGetToolContext } from '../tool-context';

const InputSchema = GetIntermarketResonanceInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_intermarket_resonance: { input: z.infer<typeof InputSchema> };
  }
}

export const getIntermarketResonanceTool = tool({
  description:
    "Evaluate Gold (XAUUSD) or major currencies' intermarket divergence against US 10-Year Real Yields (Opportunity Cost) and inflation expectations. Calculates z-score 'Hedging Premium' divergence index. Use when the user asks 'Are yields matching gold price' or 'Analyze institutional safe-haven premium'.",
  inputSchema: InputSchema,
  execute: async ({ symbol, days }): Promise<GetIntermarketResonanceOutput> => {
    const requestedSymbol: Symbol = symbol ?? 'XAUUSD';
    const db = maybeGetToolContext()?.db ?? getDb();

    // 1. Query the intermarket_resonance table
    const rows = await db
      .select()
      .from(schema.intermarketResonance)
      .orderBy(desc(schema.intermarketResonance.date))
      .limit(days);

    // Keep oldest first for charting order
    const sorted = [...rows].reverse();

    if (sorted.length === 0) {
      // In a real sandbox or when sync hasn't run yet, serve a degraded but safe response
      return {
        symbol: requestedSymbol,
        days,
        observations: [],
        currentDivergence: 0,
        currentRealYield: 2.1,
        currentBreakevenInflation: 2.3,
        regime: 'convergent',
        narrative: 'No intermarket resonance historical entries found in the database. Sync pipeline pending.',
      };
    }

    const observations: ResonanceObservation[] = sorted.map((r) => ({
      date: r.date,
      realYieldPct: r.realYieldPct,
      breakevenInflationPct: r.breakevenInflationPct,
      goldClose: r.goldClose,
      divergenceScore: r.divergenceScore,
    }));

    const latest = sorted[sorted.length - 1]!;
    const currentDivergence = latest.divergenceScore ?? 0.0;
    const currentRealYield = latest.realYieldPct ?? 2.1;
    const currentBreakevenInflation = latest.breakevenInflationPct ?? 2.3;

    // Define regimes based on standard deviations (z-scores)
    let regime: GetIntermarketResonanceOutput['regime'] = 'convergent';
    if (currentDivergence > 1.5) {
      regime = 'divergent_hedging';
    } else if (currentDivergence < -1.5) {
      regime = 'divergent_discount';
    }

    const narrative = compileNarrative(requestedSymbol, currentDivergence, currentRealYield, currentBreakevenInflation, regime);

    return {
      symbol: requestedSymbol,
      days,
      observations,
      currentDivergence,
      currentRealYield,
      currentBreakevenInflation,
      regime,
      narrative,
    };
  },
});

function compileNarrative(
  symbol: Symbol,
  divergence: number,
  yieldPct: number,
  inflationPct: number,
  regime: GetIntermarketResonanceOutput['regime'],
): string {
  const roundedDiv = Number(divergence.toFixed(2));
  const roundedYield = Number(yieldPct.toFixed(2));
  const roundedInf = Number(inflationPct.toFixed(2));

  let desc = '';
  if (regime === 'divergent_hedging') {
    desc = `Gold is trading at a significant premium (+${roundedDiv} SD) relative to its historical real-yield baseline. This highlights high institutional safe-haven demand, central bank accumulation, or geopolitical hedging premium overrides.`;
  } else if (regime === 'divergent_discount') {
    desc = `Gold is trading at a significant discount (${roundedDiv} SD) relative to yield opportunities. This indicates a highly oversold market, high opportunity cost exhaustion, or potential institutional accumulation territory.`;
  } else {
    desc = `Gold and US real yields are trading in normal historical alignment (${roundedDiv} SD). The yield opportunity cost model is dominant and governing pricing.`;
  }

  return `${symbol} Resonance: Yield ${roundedYield}% · Inflation Expectation ${roundedInf}% · Divergence ${roundedDiv} SD [${regime.toUpperCase()}]. ${desc}`;
}
