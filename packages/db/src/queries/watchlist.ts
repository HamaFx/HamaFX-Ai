/**
 * Copyright 2026 Kestrel
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

// Watchlist query helpers — symbol catalog JOINs.

import { eq, asc, and, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';
import { validationError } from '@kestrel/shared';

/** A watchlist entry enriched with symbol catalog metadata. */
export interface WatchlistEntry {
  symbol: string;
  name: string | null;
  category: string | null;
  exchange: string | null;
  tvTicker: string | null;
  pipSize: number | null;
  priceDecimals: number | null;
  currencyTags: string[] | null;
  isActive: boolean | null;
  displayOrder: number | null;
}

/**
 * Get the user's watchlist joined with symbol catalog metadata.
 * Ordered by displayOrder ascending.
 */
export async function getWatchlistWithCatalog(userId: string): Promise<WatchlistEntry[]> {
  const db = getDb();
  return db
    .select({
      symbol: schema.symbolCatalog.symbol,
      name: schema.symbolCatalog.name,
      category: schema.symbolCatalog.category,
      exchange: schema.symbolCatalog.exchange,
      tvTicker: schema.symbolCatalog.tvTicker,
      pipSize: schema.symbolCatalog.pipSize,
      priceDecimals: schema.symbolCatalog.priceDecimals,
      currencyTags: schema.symbolCatalog.currencyTags,
      isActive: schema.symbolCatalog.isActive,
      displayOrder: schema.userSymbols.displayOrder,
    })
    .from(schema.userSymbols)
    .innerJoin(
      schema.symbolCatalog,
      eq(schema.userSymbols.symbol, schema.symbolCatalog.symbol),
    )
    .where(
      and(
        eq(schema.userSymbols.userId, userId),
        eq(schema.symbolCatalog.isActive, true),
        eq(schema.symbolCatalog.tenantId, '__system__'),
      ),
    )
    .orderBy(asc(schema.userSymbols.displayOrder));
}

/**
 * Check if a symbol is active in the catalog.
 */
export async function isSymbolInCatalog(symbol: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ symbol: schema.symbolCatalog.symbol })
    .from(schema.symbolCatalog)
    .where(
      and(
        eq(schema.symbolCatalog.symbol, symbol),
        eq(schema.symbolCatalog.isActive, true),
        eq(schema.symbolCatalog.tenantId, '__system__'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Get the next displayOrder for a user's watchlist.
 */
export async function getNextDisplayOrder(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({
      maxOrder: sql<number>`coalesce(max(${schema.userSymbols.displayOrder}), -1)`,
    })
    .from(schema.userSymbols)
    .where(eq(schema.userSymbols.userId, userId));
  return (row?.maxOrder ?? -1) + 1;
}

/**
 * Reorder a user's watchlist symbols using a single CASE WHEN UPDATE.
 * @param userId - The user's ID
 * @param symbols - Array of symbols in the desired order
 */
export async function reorderWatchlist(userId: string, symbols: string[]): Promise<void> {
  if (symbols.length === 0) return;
  if (symbols.length > 100) throw validationError('watchlist reorder exceeds the 100-symbol limit');
  if (symbols.some((symbol) => symbol.length === 0 || symbol.length > 32)) {
    throw validationError('watchlist symbols must be non-empty and at most 32 characters');
  }
  if (new Set(symbols).size !== symbols.length) {
    throw validationError('watchlist reorder contains duplicate symbols');
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    // Lock the current rows for the duration of validation + update so two
    // reorder requests cannot observe and rewrite different orderings.
    await tx.execute(
      sql`SELECT ${schema.userSymbols.symbol}
          FROM ${schema.userSymbols}
          WHERE ${eq(schema.userSymbols.userId, userId)}
          FOR UPDATE`,
    );
    const existing = await tx
      .select({ symbol: schema.userSymbols.symbol })
      .from(schema.userSymbols)
      .where(eq(schema.userSymbols.userId, userId));
    const existingSymbols = existing.map((row) => row.symbol);
    if (
      existingSymbols.length !== symbols.length ||
      existingSymbols.some((symbol) => !symbols.includes(symbol))
    ) {
      throw validationError('watchlist reorder must include exactly the user watchlist symbols');
    }

    const whenClauses = symbols.map((symbol, i) =>
      sql`WHEN ${eq(schema.userSymbols.symbol, symbol)} THEN ${i}`,
    );
    await tx
      .update(schema.userSymbols)
      .set({
        displayOrder: sql`CASE ${sql.join(whenClauses, sql` `)} ELSE ${schema.userSymbols.displayOrder} END`,
      })
      .where(
        and(
          eq(schema.userSymbols.userId, userId),
          inArray(schema.userSymbols.symbol, symbols),
        ),
      );
  });
}
