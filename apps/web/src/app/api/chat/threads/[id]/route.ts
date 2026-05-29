// /api/chat/threads/[id] — load a thread + its messages, or delete it.
//
// Phase 3 hardening §17 — accept `?fields=thread` to fetch just the
// thread row (no messages). The chat surface uses this for sidebar
// title refreshes after the auto-title cron fires; pulling the
// `messages` array each time is wasteful (a thread with 100+ messages
// is ~50 KB the client doesn't need).

import { deleteThread, getThread, listMessages } from '@hamafx/ai';

import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const thread = await getThread(id);
    if (!thread) {
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
    const messages = await listMessages(id);
    return Response.json({ thread, messages });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await deleteThread(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
