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

// /api/chat/threads/[id]/export — render a thread as a Markdown
// document and stream it as text/markdown with a Content-Disposition
// attachment so the browser saves it to disk.
//
// Phase B — UX_UPGRADE_PLAN.md item 14.
//
// GET /api/chat/threads/<uuid>/export?format=md (default)
//   200 text/markdown, attachment filename=hamafx-<slug>-YYYYMMDD.md
//
// Auth: same NextAuth session gate as the rest of /api/chat.
// IDOR: scoped by userId; non-owned threads return 404.

import { getThread, listMessages } from '@hamafx/ai';
import { withRateLimit } from '@hamafx/db';

import { errorResponse, withAuth } from '@/lib/api';
import {
  exportFilename,
  renderThreadToMarkdown,
  type ExportMessage,
  type ExportThread,
} from '@/lib/thread-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Export is a one-shot read action — a tighter limit than chat
// itself. 10 calls/min covers a user regenerating / re-downloading
// a few times in a session without locking anything out.
const EXPORT_RATE_LIMIT = Number(process.env.AI_EXPORT_RATE_LIMIT ?? '10');
const MAX_MESSAGES = Number(process.env.AI_EXPORT_MAX_MESSAGES ?? '500');

export const GET = withAuth<{ id: string }>(async (req, { params, user }) => {
  const rl = await withRateLimit(user.userId, 'ai_export', EXPORT_RATE_LIMIT);
  if (!rl.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many export actions (${rl.count}/${rl.limit} per minute).`,
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  try {
    const { id } = await params;
    const thread = await getThread(user.userId, id);
    if (!thread) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'thread not found' } },
        { status: 404 },
      );
    }

    const dbMessages = await listMessages(user.userId, id, MAX_MESSAGES);

    // Project the persistence shape into the renderer shape so the
    // route handler is the only place that knows about both. This
    // also keeps `parts` JSON-typed — `unknown[]` in the persistence
    // type, narrowed via the renderer contract.
    const exportThread: ExportThread = {
      id: thread.id,
      title: thread.title,
      pinnedSymbol: thread.pinnedSymbol,
      createdAt: new Date(thread.createdAt).toISOString(),
      updatedAt: new Date(thread.updatedAt).toISOString(),
    };
    const messages: ExportMessage[] = dbMessages.map((m) => {
      const parts = Array.isArray(m.parts) ? (m.parts as ExportMessage['parts']) : [];
      return {
        id: m.id,
        role: m.role,
        createdAt: new Date(m.createdAt).toISOString(),
        content: m.content,
        ...(parts ? { parts } : {}),
      };
    });

    const md = renderThreadToMarkdown(exportThread, messages, {
      maxMessages: MAX_MESSAGES,
    });
    const filename = exportFilename(exportThread);

    return new Response(md, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        // `attachment` forces the browser to download instead of
        // rendering inline. `filename*` is the RFC 5987 form for
        // non-ASCII filenames (we don't currently produce any, but
        // this is the safer header for the future).
        'content-disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
