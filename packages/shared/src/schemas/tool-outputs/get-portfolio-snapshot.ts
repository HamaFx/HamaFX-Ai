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

// F2 — Tool output schema for get_portfolio_snapshot.

import { z } from 'zod';

export const GetPortfolioSnapshotOutputSchema = z.object({
  asOf: z.number().int(),
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
      openPositionCount: z.number().int(),
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

export type GetPortfolioSnapshotOutput = z.infer<typeof GetPortfolioSnapshotOutputSchema>;