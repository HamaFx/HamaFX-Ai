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

// PF-22 — Controller for /api/journal.
// Thin HTTP layer; business logic delegates to the JournalService.

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { JournalCreateSchema, listJournalEntriesService, createJournalEntryService } from '@/lib/services/journal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const symbolParam = url.searchParams.get('symbol');
    const result = await listJournalEntriesService(user.userId, { ...(symbolParam ? { symbol: symbolParam } : {}) });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const input = await parseJsonBody(req, JournalCreateSchema);
    const entry = await createJournalEntryService(user.userId, input);
    return Response.json({ entry }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
