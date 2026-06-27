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

// /api/chat/threads — list + create chat threads.
// Phase A: scoped by userId from the NextAuth session.

import { createThread, listThreads } from '@hamafx/ai';
import { SymbolSchema } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, getUserFromRequest, parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
  }
  try {
    // PERF-07: Cursor-based pagination. ?before=<epoch ms>&limit=<N>
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 100);
    const before = url.searchParams.get('before');
    const beforeMs = before ? Number(before) : null;
    const { threads, nextCursor } = await listThreads(user.userId, limit, beforeMs);
    return Response.json({ threads, nextCursor });
  } catch (err) {
    return errorResponse(err);
  }
}

const CreateBodySchema = z
  .object({
    pinnedSymbol: SymbolSchema.nullable().optional(),
  })
  .default({});

export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
  }
  try {
    const { pinnedSymbol } = await parseJsonBody(req, CreateBodySchema);
    const thread = await createThread(user.userId, { pinnedSymbol: pinnedSymbol ?? null });
    return Response.json({ thread }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}