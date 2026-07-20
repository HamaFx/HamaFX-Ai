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

// PF-22 — Controller for /api/journal/[id].
// Thin HTTP layer; business logic delegates to the JournalService.

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import {
  JournalPatchSchema,
  getJournalEntryService,
  updateJournalEntryService,
  deleteJournalEntryService,
} from '@/lib/services/journal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    const entry = await getJournalEntryService(user.userId, id);
    if (!entry) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'entry not found' } },
        { status: 404 },
      );
    }
    return Response.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PATCH = withAuth<{ id: string }>(async (req, { params, user }) => {
  try {
    const { id } = await params;
    const input = await parseJsonBody(req, JournalPatchSchema);
    const entry = await updateJournalEntryService(user.userId, id, input);
    if (!entry) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'entry not found' } },
        { status: 404 },
      );
    }
    return Response.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    const deleted = await deleteJournalEntryService(user.userId, id);
    if (!deleted) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'entry not found' } },
        { status: 404 },
      );
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
