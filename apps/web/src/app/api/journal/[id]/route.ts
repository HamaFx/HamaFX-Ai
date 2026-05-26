// /api/journal/[id] — read / patch (close, edit) / delete.

import { z } from 'zod';

import { TradeOutcomeSchema } from '@hamafx/shared';
import { deleteEntry, getEntry, updateEntry } from '@hamafx/ai';

import { errorResponse, parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const entry = await getEntry(id);
    if (!entry) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'entry not found' } }, { status: 404 });
    }
    return Response.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}

const PatchSchema = z.object({
  closedAt: z.number().int().nullable().optional(),
  exit: z.number().nullable().optional(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  outcome: TradeOutcomeSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const input = await parseJsonBody(req, PatchSchema);
    const entry = await updateEntry(id, input);
    if (!entry) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'entry not found' } }, { status: 404 });
    }
    return Response.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    await deleteEntry(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
