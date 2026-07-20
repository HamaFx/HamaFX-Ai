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

// PF-22 — /api/alerts — list / create (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { AlertCreateSchema, listAlertsService, createAlertService } from '@/lib/services/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') === '1';
    const result = await listAlertsService(user.userId, { activeOnly });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err, req);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const input = await parseJsonBody(req, AlertCreateSchema);
    const result = await createAlertService(user.userId, input);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err, req);
  }
});
