// /api/journal — list (with optional symbol filter) / create.

import { z } from 'zod';

import { SymbolSchema, TradeSideSchema } from '@hamafx/shared';
import { computeStats, createEntry, listEntries } from '@hamafx/ai';

import { errorResponse, parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const symbolParam = url.searchParams.get('symbol');
    const symbol = symbolParam ? SymbolSchema.parse(symbolParam) : undefined;

    const [entries, stats] = await Promise.all([
      listEntries({ ...(symbol ? { symbol } : {}) }),
      computeStats(),
    ]);
    return Response.json({ entries, stats });
  } catch (err) {
    return errorResponse(err);
  }
}

const CreateSchema = z.object({
  symbol: SymbolSchema,
  side: TradeSideSchema,
  openedAt: z.number().int(),
  entry: z.number(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const input = await parseJsonBody(req, CreateSchema);
    const entry = await createEntry({
      symbol: input.symbol,
      side: input.side,
      openedAt: input.openedAt,
      entry: input.entry,
      stop: input.stop ?? null,
      target: input.target ?? null,
      size: input.size ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
    });
    return Response.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
