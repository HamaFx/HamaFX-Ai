// SPDX-License-Identifier: Apache-2.0

// /api/chat/threads/fork — fork a thread at a user message.
//
// Phase C — UX_UPGRADE_PLAN.md item 19.
//
// Request body:
//   {
//     sourceThreadId: string  — UUID of the thread being forked
//     atMessageId: string     — UUID of the user message being edited
//     newText: string         — replacement text (max 4000 chars)
//   }
//
// Response:
//   200 { threadId: string }  — the new thread's id
//   400 { error }              — invalid body
//   404 { error }              — source thread/message not found
//
// Auth: NextAuth session gate; ownership check inside forkThread.
// Rate-limited: AI fork calls share the global AI rate-limit pool
// via `withRateLimit` because forking triggers a follow-up
// /api/chat call to stream the assistant response.

import { forkThread } from '@hamafx/ai';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ForkSchema = z.object({
  sourceThreadId: z.string().uuid(),
  atMessageId: z.string().uuid(),
  // Same cap as the composer (composer-helpers.MAX_TEXT_CHARS).
  newText: z.string().min(1).max(4000),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const input = await parseJsonBody(req, ForkSchema);
    const { newThreadId } = await forkThread({
      userId: user.userId,
      sourceThreadId: input.sourceThreadId,
      atMessageId: input.atMessageId,
      newText: input.newText,
    });
    return Response.json({ threadId: newThreadId });
  } catch (err) {
    return errorResponse(err);
  }
});
