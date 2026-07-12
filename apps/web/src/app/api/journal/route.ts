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

// /api/journal — list (with optional symbol filter) / create.

import { computeStats, createEntry, listEntries } from '@hamafx/ai';
import { SymbolSchema, TradeSideSchema } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const symbolParam = url.searchParams.get('symbol');
    const symbol = symbolParam ? SymbolSchema.parse(symbolParam) : undefined;

    const [entries, stats] = await Promise.all([
      listEntries(user.userId, { ...(symbol ? { symbol } : {}) }),
      computeStats(user.userId),
    ]);
    return Response.json({ entries, stats });
  } catch (err) {
    return errorResponse(err);
  }
});

const CreateSchema = z.object({
  symbol: SymbolSchema,
  side: TradeSideSchema,
  openedAt: z.number().int(),
  entry: z.number(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  screenshotUrl: z.string().nullable().optional(),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const input = await parseJsonBody(req, CreateSchema);
    const entry = await createEntry({
      userId: user.userId,
      symbol: input.symbol,
      side: input.side,
      openedAt: input.openedAt,
      entry: input.entry,
      stop: input.stop ?? null,
      target: input.target ?? null,
      size: input.size ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      screenshotUrl: input.screenshotUrl ?? null,
    });
    return Response.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
