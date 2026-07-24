// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth:
    <T extends { params?: Promise<unknown> }>(
      handler: (req: Request, ctx: T & { user: { userId: string } }) => Promise<Response>,
    ) =>
      async (req: Request, ctx: T) =>
        handler(req, { ...ctx, user: { userId: 'admin-123' } } as T & { user: { userId: string } }),
}));

const mockListDiagnosticTraces = vi.hoisted(() => vi.fn());
const mockGetDiagnosticTrace = vi.hoisted(() => vi.fn());
const mockRecordAdminAudit = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  listDiagnosticTraces: mockListDiagnosticTraces,
  getDiagnosticTrace: mockGetDiagnosticTrace,
  recordAdminAudit: mockRecordAdminAudit,
  schema: { diagnosticTraces: {} },
}));

import { GET as listGet } from '@/app/api/admin/diagnostics/traces/route';
import { GET as detailGet } from '@/app/api/admin/diagnostics/trace/[id]/route';

describe('GET /api/admin/diagnostics/traces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a list of trace summaries without the raw trace payload', async () => {
    mockListDiagnosticTraces.mockResolvedValue([
      {
        id: 'trace-1',
        threadId: 'thread-1',
        userId: 'user-1',
        startedAt: new Date('2026-07-24T10:00:00.000Z'),
        stepCount: 5,
        errorCount: 0,
        // Raw trace payload should be stripped by the route mapping.
        trace: { steps: [{ name: 'step' }], errors: [] },
      },
    ]);

    const req = new Request('http://localhost/api/admin/diagnostics/traces');
    const res = await listGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.traces).toHaveLength(1);
    expect(body.traces[0]).toEqual({
      id: 'trace-1',
      threadId: 'thread-1',
      userId: 'user-1',
      startedAt: '2026-07-24T10:00:00.000Z',
      stepCount: 5,
      errorCount: 0,
    });
    expect(body.traces[0]).not.toHaveProperty('trace');
  });
});

describe('GET /api/admin/diagnostics/trace/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a detail DO with steps and errors extracted from the trace JSONB', async () => {
    mockGetDiagnosticTrace.mockResolvedValue({
      id: 'trace-1',
      threadId: 'thread-1',
      userId: 'user-1',
      startedAt: new Date('2026-07-24T10:00:00.000Z'),
      durationMs: 1234,
      stepCount: 2,
      errorCount: 1,
      status: 'failed',
      summary: 'summary text',
      metadata: { key: 'value' },
      trace: {
        steps: [
          { name: 'fetch_candles', status: 'completed', durationMs: 42, timestamp: 1 },
          { name: 'run_chat', status: 'failed', timestamp: 2 },
        ],
        errors: [{ message: 'boom', name: 'Error', timestamp: 3 }],
      },
    });

    const req = new Request('http://localhost/api/admin/diagnostics/trace/trace-1');
    const res = await detailGet(req, { params: Promise.resolve({ id: 'trace-1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.trace.id).toBe('trace-1');
    expect(body.trace.status).toBe('failed');
    expect(body.trace.steps).toHaveLength(2);
    expect(body.trace.errors).toHaveLength(1);
    expect(body.trace.steps[0].name).toBe('fetch_candles');
  });

  it('returns 404 when the trace does not exist', async () => {
    mockGetDiagnosticTrace.mockResolvedValue(null);

    const req = new Request('http://localhost/api/admin/diagnostics/trace/missing');
    const res = await detailGet(req, { params: Promise.resolve({ id: 'missing' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
