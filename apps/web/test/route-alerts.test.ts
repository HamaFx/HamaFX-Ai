import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const mockListAlerts = vi.hoisted(() => vi.fn());
const mockCreateAlert = vi.hoisted(() => vi.fn());
const mockGetAlert = vi.hoisted(() => vi.fn());
const mockUpdateAlert = vi.hoisted(() => vi.fn());
const mockDeleteAlert = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/ai', () => ({
  listAlerts: mockListAlerts,
  createAlert: mockCreateAlert,
  getAlert: mockGetAlert,
  updateAlert: mockUpdateAlert,
  deleteAlert: mockDeleteAlert,
}));

const mockWithRateLimit = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  withRateLimit: mockWithRateLimit,
}));

import { auth } from '@/auth';
import { GET, POST } from '@/app/api/alerts/route';
import { GET as GET_ONE, PATCH, DELETE } from '@/app/api/alerts/[id]/route';

const USER_ID = 'test-user-001';

const mockAlert = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  userId: USER_ID,
  rule: { type: 'priceCross', symbol: 'XAUUSD', level: 2000, direction: 'above' },
  channels: ['email'],
  note: 'alert note',
  active: true,
  firedAt: null,
  snoozeHours: 0,
  createdAt: Date.now(),
};

const validCreatePayload = {
  rule: { type: 'priceCross', symbol: 'XAUUSD', level: 2000, direction: 'above' },
  channels: ['email'],
};

beforeEach(() => {
  (auth as Mock).mockResolvedValue({
    user: { id: USER_ID, email: 'test@example.com' },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });
  mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 60 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/alerts', () => {
  it('returns list of alerts', async () => {
    const alerts = [mockAlert];
    mockListAlerts.mockResolvedValue(alerts);

    const response = await GET(new Request('http://localhost/api/alerts'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.alerts).toEqual(alerts);
    expect(mockListAlerts).toHaveBeenCalledWith(USER_ID, { activeOnly: false });
  });

  it('filters by active alerts when ?active=1', async () => {
    mockListAlerts.mockResolvedValue([mockAlert]);

    const response = await GET(
      new Request('http://localhost/api/alerts?active=1'),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(200);
    expect(mockListAlerts).toHaveBeenCalledWith(USER_ID, { activeOnly: true });
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/alerts'), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Authentication required');
  });
});

describe('POST /api/alerts', () => {
  it('creates an alert and returns 201', async () => {
    const created = { ...mockAlert, id: 'new-uuid' };
    mockCreateAlert.mockResolvedValue(created);

    const response = await POST(
      new Request('http://localhost/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validCreatePayload),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.alert).toEqual(created);
    expect(mockCreateAlert).toHaveBeenCalledWith({
      ...validCreatePayload,
      userId: USER_ID,
      snoozeHours: 0,
      note: null,
    });
  });

  it('returns 400 for invalid payload', async () => {
    const response = await POST(
      new Request('http://localhost/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validCreatePayload),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mockWithRateLimit.mockResolvedValue({ allowed: false, count: 60, limit: 60 });

    const response = await POST(
      new Request('http://localhost/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validCreatePayload),
      }),
      { params: Promise.resolve({}) },
    );
    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body.error).toContain('Too many requests');
  });
});

describe('GET /api/alerts/[id]', () => {
  it('returns a single alert', async () => {
    mockGetAlert.mockResolvedValue(mockAlert);

    const response = await GET_ONE(new Request('http://localhost/api/alerts/id'), {
      params: Promise.resolve({ id: mockAlert.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.alert).toEqual(mockAlert);
  });

  it('returns 404 when alert not found', async () => {
    mockGetAlert.mockResolvedValue(null);

    const response = await GET_ONE(new Request('http://localhost/api/alerts/id'), {
      params: Promise.resolve({ id: 'nonexistent' }),
    });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await GET_ONE(new Request('http://localhost/api/alerts/id'), {
      params: Promise.resolve({ id: mockAlert.id }),
    });
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/alerts/[id]', () => {
  it('updates an alert', async () => {
    const updated = { ...mockAlert, note: 'updated note' };
    mockUpdateAlert.mockResolvedValue(updated);

    const response = await PATCH(
      new Request('http://localhost/api/alerts/id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'updated note' }),
      }),
      { params: Promise.resolve({ id: mockAlert.id }) },
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.alert.note).toBe('updated note');
  });

  it('returns 404 when alert not found', async () => {
    mockUpdateAlert.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/alerts/id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'updated' }),
      }),
      { params: Promise.resolve({ id: 'nonexistent' }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/alerts/id', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'updated' }),
      }),
      { params: Promise.resolve({ id: mockAlert.id }) },
    );
    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/alerts/[id]', () => {
  it('deletes an alert', async () => {
    mockDeleteAlert.mockResolvedValue(undefined);

    const response = await DELETE(new Request('http://localhost/api/alerts/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: mockAlert.id }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mockDeleteAlert).toHaveBeenCalledWith(USER_ID, mockAlert.id);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);

    const response = await DELETE(new Request('http://localhost/api/alerts/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: mockAlert.id }),
    });
    expect(response.status).toBe(401);
  });
});
