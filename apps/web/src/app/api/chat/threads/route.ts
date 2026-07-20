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