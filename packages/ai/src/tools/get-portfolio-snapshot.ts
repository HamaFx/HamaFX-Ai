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

// Tool: get_portfolio_snapshot
//
// F2 — Lets the AI see the user's open positions with live P&L and risk
// metrics when giving trading advice. This enables context-aware
// recommendations like "You're already long 2 lots of XAUUSD — adding
// here would exceed your concentration limit."
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F2.6 for the design.

import { z } from 'zod';
import { tool } from 'ai';

import { getOpenPositionsWithPnL, getPortfolioRiskReport } from '../portfolio';
import { getToolContext } from '../tool-context';

const InputSchema = z.object({
  includeRisk: z.boolean().optional().default(true).describe('Whether to include the risk report'),
});

const OutputSchema = z.object({
  asOf: z.number(),
  positions: z.array(
    z.object({
      symbol: z.string(),
      direction: z.enum(['long', 'short']),
      lotSize: z.number(),
      entryPrice: z.number(),
      currentPrice: z.number().nullable(),
      unrealizedPnlUsd: z.number().nullable(),
      unrealizedPnlPct: z.number().nullable(),
      riskRewardRatio: z.number().nullable(),
      stale: z.boolean(),
    }),
  ),
  risk: z
    .object({
      totalExposureUsd: z.number(),
      totalExposurePct: z.number(),
      totalRiskUsd: z.number(),
      totalRiskPct: z.number(),
      openPositionCount: z.number(),
      alerts: z.array(
        z.object({
          level: z.enum(['warning', 'danger']),
          message: z.string(),
          symbol: z.string().optional(),
        }),
      ),
    })
    .nullable(),
  empty: z.boolean(),
});

export type GetPortfolioSnapshotOutput = z.infer<typeof OutputSchema>;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    get_portfolio_snapshot: { input: z.infer<typeof InputSchema> };
  }
}

export const getPortfolioSnapshotTool = tool({
  description:
    'Get a snapshot of the user\'s open forex/gold positions with live P&L, risk metrics, and concentration alerts. Use when the user asks about their positions, portfolio, exposure, or wants trading advice that should account for existing positions.',
  inputSchema: InputSchema,
  execute: async ({ includeRisk }): Promise<GetPortfolioSnapshotOutput> => {
    const { userId } = getToolContext();

    const positions = await getOpenPositionsWithPnL(userId);

    if (positions.length === 0) {
      return {
        asOf: Date.now(),
        positions: [],
        risk: includeRisk
          ? {
              totalExposureUsd: 0,
              totalExposurePct: 0,
              totalRiskUsd: 0,
              totalRiskPct: 0,
              openPositionCount: 0,
              alerts: [],
            }
          : null,
        empty: true,
      };
    }

    const risk = includeRisk ? await getPortfolioRiskReport(userId) : null;

    return {
      asOf: Date.now(),
      positions: positions.map((p) => ({
        symbol: p.symbol,
        direction: p.direction,
        lotSize: p.lotSize,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        unrealizedPnlUsd: p.unrealizedPnlUsd,
        unrealizedPnlPct: p.unrealizedPnlPct,
        riskRewardRatio: p.riskRewardRatio,
        stale: p.stale,
      })),
      risk: risk
        ? {
            totalExposureUsd: risk.totalExposureUsd,
            totalExposurePct: risk.totalExposurePct,
            totalRiskUsd: risk.totalRiskUsd,
            totalRiskPct: risk.totalRiskPct,
            openPositionCount: risk.openPositionCount,
            alerts: risk.alerts,
          }
        : null,
      empty: false,
    };
  },
});