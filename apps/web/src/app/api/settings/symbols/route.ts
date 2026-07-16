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

import { withAuth, errorResponse, parseJsonBody } from '@/lib/api';
import { getDb, schema } from '@hamafx/db';
import { eq, asc, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { SymbolSchema } from '@hamafx/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/settings/symbols - List watchlist symbols with catalog metadata
export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const db = getDb();
    const watchlist = await db
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
        eq(schema.userSymbols.symbol, schema.symbolCatalog.symbol)
      )
      .where(eq(schema.userSymbols.userId, user.userId))
      .orderBy(asc(schema.userSymbols.displayOrder));

    return Response.json(watchlist);
  } catch (err) {
    return errorResponse(err);
  }
});

// POST /api/settings/symbols - Add symbol to watchlist
const AddSymbolSchema = z.object({
  symbol: SymbolSchema,
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const { symbol: rawSymbol } = await parseJsonBody(req, AddSymbolSchema);
    const symbol = rawSymbol.trim().toUpperCase();

    const db = getDb();

    // Check if the symbol is in the active symbol catalog
    const inCatalog = await db
      .select({ symbol: schema.symbolCatalog.symbol })
      .from(schema.symbolCatalog)
      .where(
        and(
          eq(schema.symbolCatalog.symbol, symbol),
          eq(schema.symbolCatalog.isActive, true)
        )
      )
      .limit(1);

    if (inCatalog.length === 0) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: `Symbol "${symbol}" is not supported or active.` } },
        { status: 400 }
      );
    }

    // Find next displayOrder
    const orderResult = await db
      .select({
        maxOrder: sql<number>`coalesce(max(${schema.userSymbols.displayOrder}), -1)`,
      })
      .from(schema.userSymbols)
      .where(eq(schema.userSymbols.userId, user.userId));

    const nextOrder = (orderResult[0]?.maxOrder ?? -1) + 1;

    await db
      .insert(schema.userSymbols)
      .values({
        userId: user.userId,
        symbol,
        displayOrder: nextOrder,
      })
      .onConflictDoNothing();

    return Response.json({ ok: true, symbol });
  } catch (err) {
    return errorResponse(err);
  }
});

// PATCH /api/settings/symbols - Reorder watchlist symbols
const ReorderSchema = z.object({
  symbols: z.array(z.string()),
});

export const PATCH = withAuth<void>(async (req, { user }) => {
  try {
    const { symbols } = await parseJsonBody(req, ReorderSchema);
    const db = getDb();

    // PERF-8: Bulk update with CASE WHEN instead of N sequential UPDATEs.
    if (symbols.length > 0) {
      const whenClauses = symbols.map((_s, i) =>
        sql`WHEN ${eq(schema.userSymbols.symbol, symbols[i]!)} THEN ${i}`
      );
      await db
        .update(schema.userSymbols)
        .set({
          displayOrder: sql`CASE ${sql.join(whenClauses, sql` `)} END`,
        })
        .where(eq(schema.userSymbols.userId, user.userId));
    }

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
