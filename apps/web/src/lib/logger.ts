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

// OBS-09 (Phase 5.3): Request-scoped structured logger for the web app.
//
// Adopts `packages/shared/src/logger.ts` (pino) as the single logging
// standard. The pino logger already has redaction paths configured for
// `authorization/cookie/password/email/token/keys/aiApiKeys`.
//
// Usage in route handlers:
//   import { createRequestLogger } from '@/lib/logger';
//   const log = createRequestLogger(req, user);
//   log.info('chat started', { threadId });
//   log.errorContext(err, 'agent failed', { threadId });

import { createCategorizedLogger, type CategorizedLogger } from '@hamafx/shared/logger';

import { REQUEST_ID_HEADER } from './request-id';
import type { RequestUser } from './api';

/**
 * Create a request-scoped child logger that carries `requestId`, `userId`,
 * and `service` on every log line. The requestId is read from the
 * `X-Request-Id` header stamped by middleware.
 */
export function createRequestLogger(req?: Request, user?: RequestUser | null): CategorizedLogger {
  const context: Record<string, unknown> = { service: 'web' };

  if (req) {
    const requestId = req.headers.get(REQUEST_ID_HEADER);
    if (requestId) context['requestId'] = requestId;

    // Extract route for correlation
    try {
      context['route'] = new URL(req.url).pathname;
    } catch {
      // ignore
    }
  }

  if (user?.userId) {
    context['userId'] = user.userId;
  }

  return createCategorizedLogger('api', context);
}

/**
 * Create a scoped logger for non-request contexts (cron jobs, background
 * tasks, server actions without a Request object).
 */
export function createScopedLoggerWithContext(context: Record<string, unknown>): CategorizedLogger {
  return createCategorizedLogger('api', { service: 'web', ...context });
}

// Re-export the root logger for cases where a scoped child is not needed
export { createCategorizedLogger, type CategorizedLogger };
