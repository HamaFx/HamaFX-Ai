import { afterEach, describe, expect, it, vi } from 'vitest';

import { deliverHealthAlert } from '@/lib/services/health-alert-delivery';
import type { HealthSloResponse } from '@/lib/services/admin-dtos';

const snapshot = (overrides: Partial<HealthSloResponse> = {}): HealthSloResponse => ({
  ts: '2026-08-16T00:00:00.000Z',
  dbLatencyMs: 12,
  dbOk: false,
  overall: 'unhealthy',
  langfuseActive: true,
  langfuseBaseUrl: 'https://langfuse.example.com',
  anomalies: [
    'Database is unavailable',
    'Prompt text must never be included in this payload',
  ],
  slis: [
    {
      key: 'chat_api',
      label: 'Chat API',
      current: 0,
      sloTarget: 0.995,
      window: '1 hour',
      success: 0,
      total: 3,
      errorBudget: 0,
    },
  ],
  ...overrides,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('deliverHealthAlert', () => {
  it('does not send a webhook for a healthy snapshot', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await deliverHealthAlert(
      snapshot({ overall: 'healthy', dbOk: true, anomalies: [] }),
      { fetchImpl },
    );

    expect(result).toEqual({ status: 'skipped', reason: 'healthy' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips degraded delivery when no webhook is configured', async () => {
    const result = await deliverHealthAlert(snapshot());

    expect(result).toEqual({ status: 'skipped', reason: 'not_configured' });
  });

  it('sends only bounded operational fields and authorization', async () => {
    vi.stubEnv('HEALTH_ALERT_WEBHOOK_URL', 'https://alerts.example.com/hook');
    vi.stubEnv('HEALTH_ALERT_WEBHOOK_TOKEN', 'webhook-secret');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deliverHealthAlert(snapshot(), { fetchImpl });

    expect(result).toEqual({ status: 'sent', anomalyCount: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBeInstanceOf(URL);
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer webhook-secret',
    });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      source: 'kestrel',
      event: 'health_alert',
      status: 'unhealthy',
      dbOk: false,
    });
    expect(body).not.toHaveProperty('langfuseBaseUrl');
    expect(body).not.toHaveProperty('dbLatencyMs');
    expect(body).not.toHaveProperty('prompt');
  });

  it('does not throw when the webhook responds with an error', async () => {
    vi.stubEnv('HEALTH_ALERT_WEBHOOK_URL', 'https://alerts.example.com/hook');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));

    await expect(deliverHealthAlert(snapshot(), { fetchImpl })).resolves.toEqual({
      status: 'failed',
      reason: 'http_error',
    });
  });

  it('reports network and timeout failures without blocking the health caller', async () => {
    vi.stubEnv('HEALTH_ALERT_WEBHOOK_URL', 'https://alerts.example.com/hook');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));

    await expect(deliverHealthAlert(snapshot(), { fetchImpl })).resolves.toEqual({
      status: 'failed',
      reason: 'network_error',
    });
  });

  it('rejects non-http webhook URLs without making a request', async () => {
    vi.stubEnv('HEALTH_ALERT_WEBHOOK_URL', 'file:///tmp/alerts');
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(deliverHealthAlert(snapshot(), { fetchImpl })).resolves.toEqual({
      status: 'skipped',
      reason: 'invalid_url',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
