// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/chat/threads — list + create (thin controller).

import { errorResponse, getUserFromRequest, parseJsonBody } from '@/lib/api';
import { listThreadsService, createThreadService } from '@/lib/services/chat';
import { z } from 'zod';

const CreateBodySchema = z
  .object({ pinnedSymbol: z.string().nullable().optional() })
  .default({});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 100);
    const beforeMs = url.searchParams.get('before') ? Number(url.searchParams.get('before')) : null;
    const result = await listThreadsService(user.userId, limit, beforeMs);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
  }
  try {
    const { pinnedSymbol } = await parseJsonBody(req, CreateBodySchema);
    const result = await createThreadService(user.userId, pinnedSymbol ?? null);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}