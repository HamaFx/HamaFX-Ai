// /api/alerts — list / create.

import { z } from 'zod';

import { AlertChannelSchema, AlertRuleSchema } from '@hamafx/shared';
import { createAlert, listAlerts } from '@hamafx/ai';

import { errorResponse, parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') === '1';
    const alerts = await listAlerts({ activeOnly });
    return Response.json({ alerts });
  } catch (err) {
    return errorResponse(err);
  }
}

const CreateSchema = z.object({
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).default(['email']),
  note: z.string().max(280).nullable().default(null),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const input = await parseJsonBody(req, CreateSchema);
    const alert = await createAlert(input);
    return Response.json({ alert }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
