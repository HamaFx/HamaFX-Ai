// SPDX-License-Identifier: Apache-2.0

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
