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

import { logStreamHub } from '@hamafx/shared';

import { getAdminUser } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dev-only SSE endpoint that streams captured log lines to the admin UI.
 * Requires `ENABLE_LOG_STREAM=true` and `NODE_ENV=development`.
 */
export const GET = async (_req: Request) => {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: { code: 'FORBIDDEN', message: 'Log streaming is disabled in production' } }, { status: 403 });
  }

  const { admin, reason } = await getAdminUser();
  if (!admin) {
    const status = reason === 'unauthenticated' ? 401 : 403;
    const code = reason === 'unauthenticated' ? 'UNAUTHORIZED' : 'FORBIDDEN';
    const message = reason === 'unauthenticated' ? 'Authentication required' : 'Admin access required';
    return Response.json({ error: { code, message } }, { status });
  }

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
};
