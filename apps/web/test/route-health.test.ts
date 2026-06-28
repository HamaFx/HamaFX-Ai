import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockDbExecute = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(() => ({ execute: mockDbExecute })),
}));

import { GET } from '@/app/api/health/route';

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

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('abc123');
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.env.ok).toBe(true);
    expect(body.checks.cron.ok).toBe(true);
    expect(body.checks.cron.recentRuns).toBe(42);
    expect(body.checks.cron.stuckRuns).toBe(0);
    expect(body.checks.pgvector.ok).toBe(true);
  });

  it('returns 503 when env vars are missing', async () => {
    mockDbExecute.mockResolvedValue([
      { extname: 'vector', recent: '10', stuck: '0' },
    ]);
    delete process.env.DATABASE_URL;

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.env.ok).toBe(false);
    expect(body.checks.db.ok).toBe(true);
  });

  it('returns 503 when db check fails', async () => {
    mockDbExecute.mockRejectedValue(new Error('connection refused'));

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.db.message).toContain('connection refused');
  });

  it('reports pgvector not installed when extension is missing', async () => {
    mockDbExecute.mockResolvedValue([]);

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checks.pgvector.ok).toBe(false);
    expect(body.checks.pgvector.message).toContain('pgvector extension not installed');
  });

  it('gracefully handles missing cron_runs table', async () => {
    mockDbExecute.mockResolvedValue([]);

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checks.cron.ok).toBe(true);
    expect(body.checks.cron.message).toContain('cron_runs unavailable');
  });
});
