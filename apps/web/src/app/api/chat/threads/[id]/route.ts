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

// /api/chat/threads/[id] — load a thread + its messages, or delete it.
// Phase 3 hardening §17 — accept `?fields=thread` to fetch just the
// thread row (no messages). The chat surface uses this for sidebar
// title refreshes after the auto-title cron fires; pulling the
// `messages` array each time is wasteful (a thread with 100+ messages
// is ~50 KB the client doesn't need).
//
// Phase B — IDOR fix. All operations scope to the current userId from
// the JWT. A user with a valid session for User A can never read or
// delete User B's thread, even if they guess the UUID.

import { deleteThread, getThread, listMessages } from '@hamafx/ai';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (req, { params, user }) => {
  try {
    const { id } = await params;
    const thread = await getThread(user.userId, id);
    if (!thread) {
      // 404 (not 403) so we don't leak that the thread exists for
      // another user. Same shape for "doesn't exist" and "not yours".
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'thread not found' } },
        { status: 404 },
      );
    }
    const fields = new URL(req.url).searchParams.get('fields');
    if (fields === 'thread') {
      // Skinny shape — useful for poll-style refreshes that only care
      // about title / updatedAt changes. Returns the same envelope
      // shape (`{ thread }`) so the client doesn't need to branch.
      return Response.json({ thread });
    }
    const messages = await listMessages(user.userId, id);
    return Response.json({ thread, messages });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    // deleteThread is scoped by userId at the SQL level; a no-op
    // for threads the user doesn't own.
    await deleteThread(user.userId, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
