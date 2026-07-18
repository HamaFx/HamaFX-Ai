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

// F2 — Portfolio Management
//
// Zod schemas for portfolio positions, P&L, risk analysis, and settings.
// Shared contract between the AI package portfolio services, API routes,
// and the settings UI.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F2 for the full design.

import { z } from 'zod';

import { SymbolSchema } from '../symbols';

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

export const PositionDirectionSchema = z.enum(['long', 'short']);
export type PositionDirection = z.infer<typeof PositionDirectionSchema>;

export const PositionStatusSchema = z.enum(['open', 'closed']);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

export const PortfolioPositionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  symbol: SymbolSchema,
  direction: PositionDirectionSchema,
  lotSize: z.number().positive(),
  entryPrice: z.number().positive(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  openedAt: z.number().int(),
  closedAt: z.number().int().nullable(),
  closePrice: z.number().nullable(),
  status: PositionStatusSchema,
  notes: z.string().nullable(),
  linkedSignalId: z.string().uuid().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type PortfolioPosition = z.infer<typeof PortfolioPositionSchema>;

// ---------------------------------------------------------------------------
// Position with P&L (computed at runtime)
// ---------------------------------------------------------------------------

export const PositionWithPnLSchema = PortfolioPositionSchema.extend({
  currentPrice: z.number().nullable(),
  unrealizedPnlUsd: z.number().nullable(),
  unrealizedPnlPct: z.number().nullable(),
  riskUsd: z.number().nullable(),
  rewardUsd: z.number().nullable(),
  riskRewardRatio: z.number().nullable(),
  distanceToStopPct: z.number().nullable(),
  stale: z.boolean(),
});
export type PositionWithPnL = z.infer<typeof PositionWithPnLSchema>;

// ---------------------------------------------------------------------------
// Portfolio Settings
// ---------------------------------------------------------------------------

export const PortfolioSettingsSchema = z.object({
  userId: z.string(),
  accountBalance: z.number().nullable(),
  baseCurrency: z.string().default('USD'),
  maxRiskPerTradePct: z.number().min(0).max(100).default(2.0),
  maxTotalExposurePct: z.number().min(0).max(100).default(10.0),
  updatedAt: z.number().int(),
});
export type PortfolioSettings = z.infer<typeof PortfolioSettingsSchema>;

// ---------------------------------------------------------------------------
// Risk Analysis
// ---------------------------------------------------------------------------

export const ConcentrationItemSchema = z.object({
  symbol: z.string(),
  pct: z.number(),
  alert: z.boolean(),
});
export type ConcentrationItem = z.infer<typeof ConcentrationItemSchema>;

export const CorrelationRiskItemSchema = z.object({
  pair: z.string(),
  correlation: z.number(),
  alert: z.boolean(),
});
export type CorrelationRiskItem = z.infer<typeof CorrelationRiskItemSchema>;

export const PositionNearStopSchema = z.object({
  symbol: z.string(),
  direction: PositionDirectionSchema,
  distancePct: z.number(),
});
export type PositionNearStop = z.infer<typeof PositionNearStopSchema>;

export const RiskAlertSchema = z.object({
  level: z.enum(['warning', 'danger']),
  message: z.string(),
  symbol: z.string().optional(),
});
export type RiskAlert = z.infer<typeof RiskAlertSchema>;

export const PortfolioRiskReportSchema = z.object({
  totalExposureUsd: z.number(),
  totalExposurePct: z.number(),
  totalRiskUsd: z.number(),
  totalRiskPct: z.number(),
  concentration: z.array(ConcentrationItemSchema),
  correlationRisk: z.array(CorrelationRiskItemSchema),
  positionsNearStop: z.array(PositionNearStopSchema),
  alerts: z.array(RiskAlertSchema),
  openPositionCount: z.number().int(),
});
export type PortfolioRiskReport = z.infer<typeof PortfolioRiskReportSchema>;

// ---------------------------------------------------------------------------
// Create / Update Position input
// ---------------------------------------------------------------------------

export const CreatePositionInputSchema = z.object({
  symbol: SymbolSchema,
  direction: PositionDirectionSchema,
  lotSize: z.number().positive(),
  entryPrice: z.number().positive(),
  stopLoss: z.number().optional().nullable(),
  takeProfit: z.number().optional().nullable(),
  openedAt: z.number().int().optional(),
  notes: z.string().optional().nullable(),
  linkedSignalId: z.string().uuid().optional().nullable(),
});
export type CreatePositionInput = z.infer<typeof CreatePositionInputSchema>;

export const ClosePositionInputSchema = z.object({
  closePrice: z.number().positive(),
  closedAt: z.number().int().optional(),
});
export type ClosePositionInput = z.infer<typeof ClosePositionInputSchema>;

// ---------------------------------------------------------------------------
// Contract sizes and pip values
// ---------------------------------------------------------------------------

/** Standard lot contract sizes (units of base currency). */
export const CONTRACT_SIZES: Record<string, number> = {
  XAUUSD: 100, // 100 oz per standard lot
  EURUSD: 100_000,
  GBPUSD: 100_000,
};

export function getContractSize(symbol: string): number {
  return CONTRACT_SIZES[symbol.toUpperCase()] ?? 100_000;
}

/** Pip value per standard lot in USD. */
export function getPipValue(symbol: string, lotSize: number): number {
  const s = symbol.toUpperCase();
  const pip = s === 'XAUUSD' ? 0.1 : s.endsWith('JPY') ? 0.01 : 0.0001;
  const contractSize = getContractSize(s);
  return pip * contractSize * lotSize;
}