// SPDX-License-Identifier: Apache-2.0

/**
 * GET /api/cron/health-alerts
 *
 * Computes the reliability snapshot and sends a sanitized webhook notification
 * when the system is degraded or unhealthy. The endpoint is intended for the
 * existing VM/Vercel cron scheduler and is protected by CRON_SECRET.
 */

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';
import { getDb } from '@/lib/services/api-boundary';
import { computeHealthSloService } from '@/lib/services/admin-health';
import { deliverHealthAlert } from '@/lib/services/health-alert-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return withCronAuth(request, async () => {
    const snapshot = await computeHealthSloService(getDb(), {
      hours: Number.parseInt(process.env.ALERT_WINDOW_HOURS ?? '1', 10) || 1,
    });
    const delivery = await deliverHealthAlert(snapshot);

    if (delivery.status === 'failed') {
      createScopedLoggerWithContext({ component: 'cron', job: 'health-alerts' }).error(
        { deliveryStatus: delivery.status, reason: delivery.reason },
        'health alert delivery failed after SLO evaluation',
      );
    }

    return {
      processed: snapshot.anomalies.length,
      note: `${snapshot.overall}; webhook=${delivery.status}${
        delivery.status === 'skipped' ? `:${delivery.reason}` : ''
      }`,
    };
  });
}
