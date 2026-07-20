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

// PF-01 Phase 2 — Portfolio position and settings query helpers.

import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../client';

// ── Positions ───────────────────────────────────────────────────────────────

export type PositionRow = typeof schema.portfolioPositions.$inferSelect;
export type CreatePositionInput = typeof schema.portfolioPositions.$inferInsert;

export async function listOpenPositions(userId: string): Promise<PositionRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.portfolioPositions)
    .where(
      and(
        eq(schema.portfolioPositions.userId, userId),
        eq(schema.portfolioPositions.status, 'open'),
        isNull(schema.portfolioPositions.deletedAt),
      ),
    )
    .orderBy(desc(schema.portfolioPositions.openedAt));
}

export async function listAllPositions(
  userId: string,
  opts?: { status?: string; limit?: number },
): Promise<PositionRow[]> {
  const conditions = [eq(schema.portfolioPositions.userId, userId), isNull(schema.portfolioPositions.deletedAt)];
  if (opts?.status) conditions.push(eq(schema.portfolioPositions.status, opts.status));
  const db = getDb();
  return db
    .select()
    .from(schema.portfolioPositions)
    .where(and(...conditions))
    .orderBy(desc(schema.portfolioPositions.openedAt))
    .limit(opts?.limit ?? 100);
}

export async function getPosition(id: string, userId: string): Promise<PositionRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.portfolioPositions)
    .where(and(eq(schema.portfolioPositions.id, id), eq(schema.portfolioPositions.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function createPosition(input: CreatePositionInput): Promise<PositionRow> {
  const db = getDb();
  const rows = await db.insert(schema.portfolioPositions).values(input).returning();
  return rows[0]!;
}

export async function closePosition(
  id: string,
  userId: string,
  closePrice: number,
): Promise<PositionRow | undefined> {
  const db = getDb();
  const rows = await db
    .update(schema.portfolioPositions)
    .set({ status: 'closed', closePrice, closedAt: new Date() })
    .where(and(eq(schema.portfolioPositions.id, id), eq(schema.portfolioPositions.userId, userId)))
    .returning();
  return rows[0];
}

export async function deletePosition(id: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.portfolioPositions)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.portfolioPositions.id, id), eq(schema.portfolioPositions.userId, userId)));
}

// ── Settings ────────────────────────────────────────────────────────────────

export type PortfolioSettingsRow = typeof schema.portfolioSettings.$inferSelect;

export async function getPortfolioSettings(userId: string): Promise<PortfolioSettingsRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.portfolioSettings)
    .where(eq(schema.portfolioSettings.userId, userId))
    .limit(1);
  return rows[0];
}

export async function upsertPortfolioSettings(
  userId: string,
  data: Partial<Omit<PortfolioSettingsRow, 'userId'>>,
): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.portfolioSettings)
    .values({ userId, ...data })
    .onConflictDoUpdate({
      target: schema.portfolioSettings.userId,
      set: { ...data, updatedAt: new Date() },
    });
}
