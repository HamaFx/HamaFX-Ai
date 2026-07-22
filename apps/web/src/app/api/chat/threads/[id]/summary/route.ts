// SPDX-License-Identifier: Apache-2.0

// Phase 1.5 — Thread summary endpoint.
//
// GET /api/chat/threads/[id]/summary
//
// Searches the thread's stored messages for a `summarize_thread` tool-output
// part. Returns `{ synopsis, insights }` when one exists, 404 otherwise.
// This lets the chat surface pin a "Thread summary" header once a thread is
// long enough to warrant one.

import { listMessages } from '@hamafx/ai';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SummaryResponse {
  synopsis: string;
  insights: Array<{ text: string; symbol?: string | null }>;
}

export const GET = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    const messages = await listMessages(user.userId, id);

    for (const msg of messages) {
      const parts = msg.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue;
        // The AI SDK stores tool invocations as parts with `type: 'tool-<name>'`.
        // We look for `tool-summarize_thread` with an `output-available` state.
        const t = (part as { type?: string }).type;
        if (t !== 'tool-summarize_thread') continue;
        const output = (part as { output?: unknown }).output;
        if (!output || typeof output !== 'object') continue;
        const synopsis = (output as { synopsis?: unknown }).synopsis;
        const insights = (output as { insights?: unknown }).insights;
        if (typeof synopsis !== 'string' || !Array.isArray(insights)) continue;

        const body: SummaryResponse = {
          synopsis,
          insights: insights
            .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
            .map((i) => {
              const text = (i['text'] as unknown) ?? '';
              const symbol = (i['symbol'] as string | null | undefined) ?? null;
              return { text: String(text), ...(symbol ? { symbol } : {}) };
            }),
        };
        return Response.json(body);
      }
    }

    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'no thread summary yet' } },
      { status: 404 },
    );
  } catch (err) {
    return errorResponse(err);
  }
});
