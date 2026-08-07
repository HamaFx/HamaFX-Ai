// SPDX-License-Identifier: Apache-2.0

// GET /api/cron/billing-dlq — alert on authenticated billing webhook
// failures that have remained pending for at least one hour.

import * as Sentry from '@sentry/nextjs';

import { countStaleBillingWebhookFailures } from '@hamafx/db';
import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const pendingOlderThanHour = await countStaleBillingWebhookFailures(cutoff);

    if (pendingOlderThanHour > 0) {
      Sentry.captureMessage('Billing webhook DLQ has stale pending entries', {
        level: 'error',
        tags: { component: 'billing-webhook', kind: 'dlq-stale' },
        extra: { pendingOlderThanHour, cutoff: cutoff.toISOString() },
      });
      createScopedLoggerWithContext({ component: 'cron', job: 'billing-dlq' }).error(
        { pendingOlderThanHour, cutoff: cutoff.toISOString() },
        'billing webhook DLQ contains stale pending entries',
      );
    }

    return {
      processed: pendingOlderThanHour,
      note: pendingOlderThanHour > 0
        ? `${pendingOlderThanHour} pending billing webhook failure(s) older than one hour`
        : 'No stale billing webhook failures',
    };
  });
}
