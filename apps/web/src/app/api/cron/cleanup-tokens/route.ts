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

// §3.5 step 4: GET /api/cron/cleanup-tokens — purges expired
// verificationTokens rows. Idempotent; safe to run frequently.
//
// Schedule: daily via the GCE VM systemd timer or Vercel cron.

import { withCronAuth } from '@/lib/cron';
import { lazyPurgeExpiredTokens } from '@hamafx/db';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'cleanup-tokens' });
  return withCronAuth(req, async () => {
    const now = new Date();
    const result = await lazyPurgeExpiredTokens();

    log.info('purged expired verification tokens', { count: result });
    return { processed: result, note: `purged ${result} expired tokens at ${now.toISOString()}` };
  });
}
