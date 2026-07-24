// SPDX-License-Identifier: Apache-2.0

import { logStreamHub } from '@hamafx/shared';

import { withAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dev-only SSE endpoint that streams captured log lines to the admin UI.
 * Requires `ENABLE_LOG_STREAM=true` and `NODE_ENV=development`.
 */
// Environment gate is checked first so the dev-only endpoint does not
// leak its existence in production before any auth checks run.
const adminStreamHandler = withAdminAuth(async (_req) => {
  if (!logStreamHub.isEnabled()) {
    return Response.json(
      { error: { code: 'NOT_ENABLED', message: 'Log streaming is not enabled. Set ENABLE_LOG_STREAM=true' } },
      { status: 503 },
    );
  }

  const clientId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      logStreamHub.subscribe(clientId, controller as unknown as ReadableStreamDefaultController<string>);
    },
    cancel() {
      logStreamHub.unsubscribe(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

export const GET = async (req: Request, ctx: { params: Promise<Record<string, never>> }) => {
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { error: { code: 'FORBIDDEN', message: 'Log streaming is disabled in production' } },
      { status: 403 },
    );
  }

  return adminStreamHandler(req, ctx);
};
