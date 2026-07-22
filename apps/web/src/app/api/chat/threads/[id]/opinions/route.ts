// SPDX-License-Identifier: Apache-2.0

import { getThread, listAgentOpinions } from '@hamafx/ai';
import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (req, { user, params }) => {
  const { id: threadId } = await params;
  if (!threadId || typeof threadId !== 'string') return errorResponse(new Error('Thread ID is required'));
  try {
    // S1 fix — defense in depth: verify thread ownership before returning opinions.
    const thread = await getThread(user.userId, threadId);
    if (!thread) return Response.json({ error: { code: 'NOT_FOUND', message: 'Thread not found' } }, { status: 404 });
    const opinions = await listAgentOpinions(user.userId, threadId);
    return Response.json({ opinions });
  } catch (err) { return errorResponse(err); }
});