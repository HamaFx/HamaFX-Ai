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

// /api/portfolio/positions — list open positions with P&L, or create a new position.
// GET  /api/portfolio/positions?status=open|all
// POST /api/portfolio/positions

import {
  closePosition,
  createPosition,
  getOpenPositionsWithPnL,
  listAllPositions,
} from '@hamafx/ai';
import { CreatePositionInputSchema } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? 'open';

    if (status === 'all') {
      const positions = await listAllPositions(user.userId);
      return Response.json({ positions });
    }

    // Default: open positions with live P&L
    const positions = await getOpenPositionsWithPnL(user.userId);
    return Response.json({ positions });
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const input = CreatePositionInputSchema.parse(body);

    const position = await createPosition(user.userId, input);
    return Response.json({ position }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});