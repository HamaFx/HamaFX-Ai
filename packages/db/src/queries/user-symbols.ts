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

// User symbol watchlist query helpers.

import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type UserSymbolRow = typeof schema.userSymbols.$inferSelect;
export type UserSymbolInsert = typeof schema.userSymbols.$inferInsert;

export async function listUserSymbols(
  userId: string,
): Promise<UserSymbolRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.userSymbols)
    .where(eq(schema.userSymbols.userId, userId))
    .orderBy(asc(schema.userSymbols.displayOrder));
}

export async function listDistinctSymbols(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ symbol: schema.userSymbols.symbol })
    .from(schema.userSymbols);
  return rows.map((r) => r.symbol);
}

export async function addUserSymbol(
  userId: string,
  symbol: string,
  displayOrder?: number,
): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.userSymbols)
    .values({
      userId,
      symbol,
      displayOrder: displayOrder ?? 0,
    })
    .onConflictDoNothing({ target: [schema.userSymbols.userId, schema.userSymbols.symbol] });
}

export async function removeUserSymbol(
  userId: string,
  symbol: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.userSymbols)
    .where(
      and(
        eq(schema.userSymbols.userId, userId),
        eq(schema.userSymbols.symbol, symbol),
      ),
    );
}

export async function countUserSymbols(userId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.userSymbols.userId })
    .from(schema.userSymbols)
    .where(eq(schema.userSymbols.userId, userId))
    .limit(1);
  return rows.length;
}
