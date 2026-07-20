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

// PF-22 — /api/portfolio/positions — list / create positions (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { listPositionsService, createPositionService } from '@/lib/services/portfolio';
import { CreatePositionInputSchema } from '@hamafx/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? undefined;
    const result = await listPositionsService(user.userId, status);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const input = CreatePositionInputSchema.parse(body);
    const result = await createPositionService(user.userId, input);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});