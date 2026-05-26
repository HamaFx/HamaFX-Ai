// /api/alerts/[id] — read / patch / delete one alert.

import { z } from 'zod';

import { AlertChannelSchema, AlertRuleSchema } from '@hamafx/shared';
import { deleteAlert, getAlert, updateAlert } from '@hamafx/ai';

import { errorResponse, parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const alert = await getAlert(id);
    if (!alert) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'alert not found' } }, { status: 404 });
    }
    return Response.json({ alert });
  } catch (err) {
    return errorResponse(err);
  }
}

const PatchSchema = z.object({
  rule: AlertRuleSchema.optional(),
  channels: z.array(AlertChannelSchema).optional(),
  note: z.string().max(280).nullable().optional(),
  active: z.boolean().optional(),
  /** Pass `null` to re-arm a fired alert. */
  firedAt: z.number().int().nullable().optional(),
});

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const input = await parseJsonBody(req, PatchSchema);
    const alert = await updateAlert(id, input);
    if (!alert) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'alert not found' } }, { status: 404 });
    }
    return Response.json({ alert });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id } = await ctx.params;
    await deleteAlert(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
