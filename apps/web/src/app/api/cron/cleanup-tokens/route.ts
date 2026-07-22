// SPDX-License-Identifier: Apache-2.0

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
