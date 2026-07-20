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
import { getWatchlistWithCatalog, isSymbolInCatalog, getNextDisplayOrder, reorderWatchlist, addUserSymbol } from '@hamafx/db';
import { z } from 'zod';
import { SymbolSchema } from '@hamafx/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/settings/symbols - List watchlist symbols with catalog metadata
export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const watchlist = await getWatchlistWithCatalog(user.userId);
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

    // Check if the symbol is in the active symbol catalog
    const inCatalog = await isSymbolInCatalog(symbol);

    if (!inCatalog) {
      return Response.json(
        { error: { code: 'BAD_REQUEST', message: `Symbol "${symbol}" is not supported or active.` } },
        { status: 400 }
      );
    }

    const nextOrder = await getNextDisplayOrder(user.userId);

    await addUserSymbol(user.userId, symbol, nextOrder);

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

    await reorderWatchlist(user.userId, symbols);

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
