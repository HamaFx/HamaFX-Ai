// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockWithCronAuth = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn());
const mockComputeHealth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/cron', () => ({ withCronAuth: mockWithCronAuth }));
vi.mock('@/lib/services/api-boundary', () => ({ getDb: mockGetDb }));
vi.mock('@/lib/services/admin-health', () => ({ computeHealthSloService: mockComputeHealth }));

import { GET } from '@/app/api/health/alerts/route';

const healthySnapshot = {
  overall: 'healthy',
  ts: '2026-08-16T00:00:00.000Z',
  dbOk: true,
  anomalies: [],
  slis: [],
};

describe('GET /api/health/alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({});
    mockWithCronAuth.mockImplementation(async (_request: Request, handler: () => Promise<unknown>) => {
      await handler();
      return Response.json({ processed: 0, note: 'healthy' });
    });
  });

  it('returns a 200 ok payload when critical signals are healthy', async () => {
    mockComputeHealth.mockResolvedValue(healthySnapshot);

    const response = await GET(new Request('http://localhost/api/health/alerts'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', overall: 'healthy', anomalies: [] });
    expect(body.slis).toEqual([]);
  });

  it('returns 503 and only machine-actionable critical anomalies', async () => {
    mockComputeHealth.mockResolvedValue({
      ...healthySnapshot,
      overall: 'degraded',
      anomalies: [
        'No chat turns in the selected window — chat health cannot be verified',
        'A diagnostic trace failed to complete',
        'Informational note for operators',
      ],
    });

    const response = await GET(new Request('http://localhost/api/health/alerts'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('alert');
    expect(body.anomalies).toEqual([
      'No chat turns in the selected window — chat health cannot be verified',
      'A diagnostic trace failed to complete',
    ]);
  });
});
