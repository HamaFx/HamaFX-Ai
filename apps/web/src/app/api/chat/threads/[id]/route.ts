// /api/chat/threads/[id] — load a thread + its messages, or delete it.

import { deleteThread, getThread, listMessages } from '@hamafx/ai';

import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const thread = await getThread(id);
    if (!thread) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'thread not found' } }, { status: 404 });
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
