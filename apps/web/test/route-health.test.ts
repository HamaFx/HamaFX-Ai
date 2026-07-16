import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockDbExecute = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(() => ({ execute: mockDbExecute })),
}));

// Mock getUserFromRequest to return a known user — avoids HMAC issues in vitest.
// getUserFromRequest is the only function from @/lib/api that needs mocking.
const { vi: vitest } = await import('vitest');
vitest.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getUserFromRequest: () => Promise.resolve({ userId: 'test-user' }),
  };
});

import { GET } from '@/app/api/health/route';

const REQ = new Request('http://localhost/api/health');

const ENV = {
  DATABASE_URL: 'test-db-url',
  AUTH_COOKIE_SECRET: 'test-auth-secret',
  CRON_SECRET: 'test-cron-secret',
  DEPLOYED_SHA: 'abc123',
};

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    process.env[k] = v;
  }
});

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    delete process.env[k];
  }
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('returns 200 with status ok when all checks pass', async () => {
    mockDbExecute.mockResolvedValue([
      { extname: 'vector', recent: '42', stuck: '0' },
    ]);

    const response = await GET(REQ, { params: Promise.resolve(undefined as never) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.env.ok).toBe(true);
    expect(body.checks.pgvector.ok).toBe(true);
  });

  it('returns 503 when env vars are missing', async () => {
    mockDbExecute.mockResolvedValue([
      { extname: 'vector', recent: '10', stuck: '0' },
    ]);
    delete process.env.DATABASE_URL;

    const response = await GET(REQ, { params: Promise.resolve(undefined as never) });
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.env.ok).toBe(false);
  });

  it('returns 503 when db check fails', async () => {
    mockDbExecute.mockRejectedValue(new Error('connection refused'));

    const response = await GET(REQ, { params: Promise.resolve(undefined as never) });
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.db.message).toContain('connection refused');
  });

  it('reports pgvector not installed when extension is missing', async () => {
    mockDbExecute.mockResolvedValue([]);

    const response = await GET(REQ, { params: Promise.resolve(undefined as never) });
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.pgvector.ok).toBe(false);
  });

  it('gracefully handles missing cron_runs table', async () => {
    mockDbExecute.mockResolvedValue([]);

    const response = await GET(REQ, { params: Promise.resolve(undefined as never) });
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.cron.ok).toBe(true);
  });
});
