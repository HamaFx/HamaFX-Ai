// SPDX-License-Identifier: Apache-2.0

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
