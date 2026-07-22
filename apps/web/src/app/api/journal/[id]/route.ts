// SPDX-License-Identifier: Apache-2.0

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
