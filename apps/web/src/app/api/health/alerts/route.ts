// SPDX-License-Identifier: Apache-2.0

/**
 * Machine-readable SLO alert contract for external monitors.
 *
 * This endpoint deliberately uses the same health computation as the admin
 * dashboard, but is protected by CRON_SECRET instead of a browser session so
 * Better Stack, healthchecks.io, or a VM timer can poll it safely.
 *
 * 200 = all measured signals are healthy
 * 503 = database is unhealthy or one or more reliability signals degraded
 * 401 = missing/invalid monitor credential
 */

import { withCronAuth } from '@/lib/cron';
import { getDb } from '@/lib/services/api-boundary';
import { computeHealthSloService } from '@/lib/services/admin-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  let snapshot: Awaited<ReturnType<typeof computeHealthSloService>> | undefined;
  const authResponse = await withCronAuth(request, async () => {
    snapshot = await computeHealthSloService(getDb(), {
      hours: Number.parseInt(process.env.ALERT_WINDOW_HOURS ?? '1', 10) || 1,
    });
    return {
      processed: snapshot.anomalies.length,
      note: snapshot.overall,
    };
  });

  if (authResponse.status !== 200 || !snapshot) return authResponse;

  const criticalAnomalies = snapshot.anomalies.filter((anomaly) =>
    /database|db |tick|worker|stuck|stale|dead-letter|budget reservation|diagnostic trace|provider fallback|Full-mode completion|Sentiment specialist|Recovery telemetry|Cron completion|AI tool success/i.test(anomaly),
  );
  const healthy = snapshot.dbOk && criticalAnomalies.length === 0;
  return Response.json(
    {
      status: healthy ? 'ok' : 'alert',
      overall: snapshot.overall,
      ts: snapshot.ts,
      dbOk: snapshot.dbOk,
      anomalies: criticalAnomalies,
      slis: snapshot.slis.map((sli) => ({
        key: sli.key,
        current: sli.current,
        target: sli.sloTarget,
        total: sli.total,
        errorBudget: sli.errorBudget,
      })),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
