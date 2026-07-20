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

// PF-22 — Portfolio service layer.
//
// Separates business logic from HTTP handling. Route handlers (controllers)
// call these service functions instead of importing @hamafx/ai directly.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import {
  createPosition as aiCreatePosition,
  getOpenPositionsWithPnL,
  listAllPositions as aiListAllPositions,
  getPosition as aiGetPosition,
  closePosition as aiClosePosition,
  deletePosition as aiDeletePosition,
  getPortfolioSettings as aiGetPortfolioSettings,
  savePortfolioSettings as aiSavePortfolioSettings,
  getPortfolioRiskReport as aiGetPortfolioRiskReport,
} from '@hamafx/ai';
import type {
  CreatePositionInputSchema,
  ClosePositionInputSchema,
  PortfolioSettings,
  PortfolioPosition,
  PositionWithPnL,
  PortfolioRiskReport,
} from '@hamafx/shared';
import { z } from 'zod';

// ── Schemas ─────────────────────────────────────────────────────────────────

export const PortfolioUpdateSettingsSchema = z.object({
  accountBalance: z.number().nullable().optional(),
  baseCurrency: z.string().optional(),
  maxRiskPerTradePct: z.number().min(0).max(100).optional(),
  maxTotalExposurePct: z.number().min(0).max(100).optional(),
});

export type PortfolioUpdateSettingsInput = z.infer<typeof PortfolioUpdateSettingsSchema>;

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface PositionDTO {
  id: string;
  userId: string;
  symbol: string;
  side: string;
  entry: number;
  currentPrice?: number;
  stop: number | null;
  target: number | null;
  size: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
}

export type PortfolioSettingsDTO = PortfolioSettings;

export interface RiskReportDTO {
  totalExposure: number;
  dailyPnl: number;
  tradeCount: number;
  winRate: number;
  [key: string]: unknown;
}

// ── DTO mappers ──────────────────────────────────────────────────────────────

/** Map domain PortfolioPosition → PositionDTO (field names + timestamp conversion). */
function toPositionDTO(p: PortfolioPosition | PositionWithPnL): PositionDTO {
  const cp = 'currentPrice' in p ? p.currentPrice : null;
  const result: PositionDTO = {
    id: p.id,
    userId: p.userId,
    symbol: p.symbol,
    side: p.direction,
    entry: p.entryPrice,
    stop: p.stopLoss,
    target: p.takeProfit,
    size: p.lotSize,
    status: p.status,
    openedAt: new Date(p.openedAt).toISOString(),
    closedAt: p.closedAt ? new Date(p.closedAt).toISOString() : null,
  };
  if (cp != null) result.currentPrice = cp;
  return result;
}

/** Map domain PortfolioRiskReport → RiskReportDTO (preserves extended fields via destructure-spread). */
function toRiskReportDTO(r: PortfolioRiskReport): RiskReportDTO {
  const { totalExposureUsd, openPositionCount, ...rest } = r;
  return {
    totalExposure: totalExposureUsd,
    dailyPnl: 0,
    tradeCount: openPositionCount,
    winRate: 0,
    ...rest, // preserve concentration, correlationRisk, alerts, etc.
  };
}

// ── Service functions ────────────────────────────────────────────────────────

export async function listPositionsService(
  userId: string,
  status?: string,
): Promise<{ positions: PositionDTO[] }> {
  if (status === 'all') {
    const positions = await aiListAllPositions(userId);
    return { positions: positions.map(toPositionDTO) };
  }
  const positions = await getOpenPositionsWithPnL(userId);
  return { positions: positions.map(toPositionDTO) };
}

export async function createPositionService(
  userId: string,
  input: z.infer<typeof CreatePositionInputSchema>,
): Promise<{ position: PositionDTO }> {
  const position = await aiCreatePosition(userId, input);
  return { position: toPositionDTO(position) };
}

export async function getPositionService(
  userId: string,
  id: string,
): Promise<PositionDTO | null> {
  const position = await aiGetPosition(userId, id);
  return position ? toPositionDTO(position) : null;
}

export async function closePositionService(
  userId: string,
  id: string,
  input: z.infer<typeof ClosePositionInputSchema>,
): Promise<PositionDTO | null> {
  const position = await aiClosePosition(userId, id, input);
  return position ? toPositionDTO(position) : null;
}

export async function deletePositionService(userId: string, id: string): Promise<void> {
  await aiDeletePosition(userId, id);
}

export async function getPortfolioSettingsService(
  userId: string,
): Promise<{ settings: PortfolioSettingsDTO | null }> {
  const settings = await aiGetPortfolioSettings(userId);
  return { settings };
}

export async function savePortfolioSettingsService(
  userId: string,
  input: PortfolioUpdateSettingsInput,
): Promise<{ settings: PortfolioSettingsDTO | null }> {
  const cleaned = Object.fromEntries(
    Object.entries(input).filter(([_, v]) => v !== undefined),
  ) as Partial<Pick<PortfolioSettings, 'accountBalance' | 'baseCurrency' | 'maxRiskPerTradePct' | 'maxTotalExposurePct'>>;

  const settings = await aiSavePortfolioSettings(userId, cleaned);
  return { settings };
}

export async function getRiskReportService(
  userId: string,
): Promise<{ report: RiskReportDTO }> {
  const report = await aiGetPortfolioRiskReport(userId);
  return { report: toRiskReportDTO(report) };
}
