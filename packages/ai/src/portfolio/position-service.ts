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

// F2 — Portfolio Position Persistence
//
// CRUD for portfolio_positions and portfolio_settings tables.
// Row ↔ domain object mapping follows the same pattern as decision-signals.

import { getDb, schema } from '@hamafx/db';
import { and, desc, eq } from 'drizzle-orm';

import type {
  PortfolioPosition,
  PortfolioSettings,
  PositionDirection,
  PositionStatus,
  CreatePositionInput,
  ClosePositionInput,
} from '@hamafx/shared';

// ---------------------------------------------------------------------------
// Position CRUD
// ---------------------------------------------------------------------------

export async function createPosition(
  userId: string,
  input: CreatePositionInput,
): Promise<PortfolioPosition> {
  const [row] = await getDb()
    .insert(schema.portfolioPositions)
    .values({
      userId,
      symbol: input.symbol,
      direction: input.direction,
      lotSize: input.lotSize,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      openedAt: input.openedAt ? new Date(input.openedAt) : new Date(),
      notes: input.notes ?? null,
      linkedSignalId: input.linkedSignalId ?? null,
      status: 'open',
    })
    .returning();

  return rowToPosition(row!);
}

export async function listOpenPositions(userId: string): Promise<PortfolioPosition[]> {
  const rows = await getDb()
    .select()
    .from(schema.portfolioPositions)
    .where(
      and(
        eq(schema.portfolioPositions.userId, userId),
        eq(schema.portfolioPositions.status, 'open'),
      ),
    )
    .orderBy(desc(schema.portfolioPositions.openedAt));

  return rows.map(rowToPosition);
}

export async function listAllPositions(
  userId: string,
  limit = 100,
): Promise<PortfolioPosition[]> {
  const rows = await getDb()
    .select()
    .from(schema.portfolioPositions)
    .where(eq(schema.portfolioPositions.userId, userId))
    .orderBy(desc(schema.portfolioPositions.openedAt))
    .limit(limit);

  return rows.map(rowToPosition);
}

export async function getPosition(userId: string, positionId: string): Promise<PortfolioPosition | null> {
  const rows = await getDb()
    .select()
    .from(schema.portfolioPositions)
    .where(
      and(
        eq(schema.portfolioPositions.userId, userId),
        eq(schema.portfolioPositions.id, positionId),
      ),
    )
    .limit(1);

  return rows.length > 0 ? rowToPosition(rows[0]!) : null;
}

export async function closePosition(
  userId: string,
  positionId: string,
  input: ClosePositionInput,
): Promise<PortfolioPosition | null> {
  const [row] = await getDb()
    .update(schema.portfolioPositions)
    .set({
      status: 'closed',
      closePrice: input.closePrice,
      closedAt: input.closedAt ? new Date(input.closedAt) : new Date(),
    })
    .where(
      and(
        eq(schema.portfolioPositions.userId, userId),
        eq(schema.portfolioPositions.id, positionId),
        eq(schema.portfolioPositions.status, 'open'),
      ),
    )
    .returning();

  return row ? rowToPosition(row) : null;
}

export async function deletePosition(userId: string, positionId: string): Promise<void> {
  await getDb()
    .delete(schema.portfolioPositions)
    .where(
      and(
        eq(schema.portfolioPositions.userId, userId),
        eq(schema.portfolioPositions.id, positionId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

export async function getPortfolioSettings(userId: string): Promise<PortfolioSettings> {
  const rows = await getDb()
    .select()
    .from(schema.portfolioSettings)
    .where(eq(schema.portfolioSettings.userId, userId))
    .limit(1);

  if (rows.length === 0) {
    return {
      userId,
      accountBalance: null,
      baseCurrency: 'USD',
      maxRiskPerTradePct: 2.0,
      maxTotalExposurePct: 10.0,
      updatedAt: Date.now(),
    };
  }

  return rowToSettings(rows[0]!);
}

export async function savePortfolioSettings(
  userId: string,
  updates: Partial<Pick<PortfolioSettings, 'accountBalance' | 'baseCurrency' | 'maxRiskPerTradePct' | 'maxTotalExposurePct'>>,
): Promise<PortfolioSettings> {
  const current = await getPortfolioSettings(userId);
  const merged = { ...current, ...updates };

  await getDb()
    .insert(schema.portfolioSettings)
    .values({
      userId,
      accountBalance: merged.accountBalance ?? null,
      baseCurrency: merged.baseCurrency,
      maxRiskPerTradePct: merged.maxRiskPerTradePct,
      maxTotalExposurePct: merged.maxTotalExposurePct,
    })
    .onConflictDoUpdate({
      target: schema.portfolioSettings.userId,
      set: {
        accountBalance: merged.accountBalance ?? null,
        baseCurrency: merged.baseCurrency,
        maxRiskPerTradePct: merged.maxRiskPerTradePct,
        maxTotalExposurePct: merged.maxTotalExposurePct,
      },
    });

  return merged;
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToPosition(row: typeof schema.portfolioPositions.$inferSelect): PortfolioPosition {
  return {
    id: row.id,
    userId: row.userId,
    symbol: row.symbol,
    direction: row.direction as PositionDirection,
    lotSize: row.lotSize,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit: row.takeProfit,
    openedAt: row.openedAt.getTime(),
    closedAt: row.closedAt?.getTime() ?? null,
    closePrice: row.closePrice,
    status: row.status as PositionStatus,
    notes: row.notes,
    linkedSignalId: row.linkedSignalId,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function rowToSettings(row: typeof schema.portfolioSettings.$inferSelect): PortfolioSettings {
  return {
    userId: row.userId,
    accountBalance: row.accountBalance,
    baseCurrency: row.baseCurrency,
    maxRiskPerTradePct: row.maxRiskPerTradePct,
    maxTotalExposurePct: row.maxTotalExposurePct,
    updatedAt: row.updatedAt.getTime(),
  };
}