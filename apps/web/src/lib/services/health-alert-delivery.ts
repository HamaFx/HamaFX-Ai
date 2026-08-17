// SPDX-License-Identifier: Apache-2.0

import type { HealthSloResponse } from './admin-dtos';
import { createScopedLoggerWithContext } from '@/lib/logger';

export type HealthAlertDeliveryResult =
  | { status: 'sent'; anomalyCount: number }
  | { status: 'skipped'; reason: 'healthy' | 'not_configured' | 'invalid_url' }
  | { status: 'failed'; reason: 'timeout' | 'http_error' | 'network_error' };

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_ANOMALIES = 20;
const MAX_ANOMALY_LENGTH = 240;

/**
 * Deliver an operational health alert to a generic HTTP webhook.
 *
 * The webhook is deliberately vendor-neutral: Slack, PagerDuty, email
 * gateways, or an internal incident router can all consume the same JSON.
 * No user content, prompts, trace bodies, credentials, or database details
 * are included in the payload.
 *
 * Delivery is best-effort. The health endpoint remains the source of truth;
 * a webhook outage must not turn a health check into an application outage.
 */
export async function deliverHealthAlert(
  snapshot: HealthSloResponse,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<HealthAlertDeliveryResult> {
  if (snapshot.overall === 'healthy' && snapshot.dbOk) {
    return { status: 'skipped', reason: 'healthy' };
  }

  const webhookUrl = process.env.HEALTH_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return { status: 'skipped', reason: 'not_configured' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return { status: 'skipped', reason: 'invalid_url' };
    }
  } catch {
    return { status: 'skipped', reason: 'invalid_url' };
  }

  const payload = buildHealthAlertPayload(snapshot);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? Number(process.env.HEALTH_ALERT_WEBHOOK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(parsedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.HEALTH_ALERT_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.HEALTH_ALERT_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      createScopedLoggerWithContext({ component: 'health-alert-delivery' }).warn(
        { statusCode: response.status },
        'health alert webhook returned a non-success status',
      );
      return { status: 'failed', reason: 'http_error' };
    }

    return { status: 'sent', anomalyCount: payload.anomalies.length };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'timeout'
      : 'network_error';
    createScopedLoggerWithContext({ component: 'health-alert-delivery' }).warn(
      { reason },
      'health alert webhook delivery failed',
    );
    return { status: 'failed', reason };
  } finally {
    clearTimeout(timeout);
  }
}

function buildHealthAlertPayload(snapshot: HealthSloResponse) {
  return {
    source: 'kestrel',
    event: 'health_alert',
    status: snapshot.overall,
    ts: snapshot.ts,
    dbOk: snapshot.dbOk,
    anomalies: snapshot.anomalies
      .slice(0, MAX_ANOMALIES)
      .map((anomaly) => anomaly.slice(0, MAX_ANOMALY_LENGTH)),
    slis: snapshot.slis.map((sli) => ({
      key: sli.key,
      current: sli.current,
      target: sli.sloTarget,
      total: sli.total,
      errorBudget: sli.errorBudget,
    })),
  };
}
