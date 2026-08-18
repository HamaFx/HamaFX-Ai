import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAiRegressionCases: vi.fn(),
  updateAiRegressionCaseStatus: vi.fn(),
  recordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: { user: { userId: string }; params: Promise<{ id: string }> }) => Promise<Response>) =>
    (req: Request, ctx?: { params?: Promise<{ id: string }> }) => handler(req, { user: { userId: 'admin-1' }, params: ctx?.params ?? Promise.resolve({ id: 'case-1' }) }),
}));

vi.mock('@/lib/api', () => ({
  parseSearchParams: (req: Request, schema: { parse: (value: Record<string, string>) => unknown }) => {
    const url = new URL(req.url);
    return schema.parse(Object.fromEntries(url.searchParams.entries()));
  },
  parseJsonBody: vi.fn(async (req: Request, schema: { parse: (value: unknown) => unknown }) => schema.parse(await req.json())),
  errorResponse: vi.fn((error: unknown) => Response.json({ error: String(error) }, { status: 500 })),
}));

vi.mock('@/lib/services/api-boundary', () => ({
  listAiRegressionCases: mocks.listAiRegressionCases,
  updateAiRegressionCaseStatus: mocks.updateAiRegressionCaseStatus,
}));

vi.mock('@/lib/services/admin', () => ({ recordAdminAudit: mocks.recordAdminAudit }));

import { GET } from '@/app/api/admin/regression-cases/route';
import { PATCH } from '@/app/api/admin/regression-cases/[id]/route';

const row = {
  id: 'case-1',
  feedbackId: 'feedback-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  threadId: 'thread-1',
  messageId: 'message-1',
  promptSha256: 'a'.repeat(64),
  assistantOutputSha256: 'b'.repeat(64),
  issueCodes: ['wrong_number'],
  reviewerNote: 'Unsupported price.',
  status: 'open',
  createdAt: new Date('2026-08-18T12:00:00.000Z'),
  updatedAt: new Date('2026-08-18T12:00:00.000Z'),
};

describe('admin regression cases API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAiRegressionCases.mockResolvedValue([row]);
    mocks.updateAiRegressionCaseStatus.mockResolvedValue({ ...row, status: 'resolved' });
  });

  it('returns privacy-safe case fields', async () => {
    const response = await GET(new Request('http://localhost/api/admin/regression-cases?status=open'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cases: [{
      id: row.id,
      feedbackId: row.feedbackId,
      threadId: row.threadId,
      messageId: row.messageId,
      promptSha256: row.promptSha256,
      assistantOutputSha256: row.assistantOutputSha256,
      issueCodes: row.issueCodes,
      reviewerNote: row.reviewerNote,
      status: row.status,
      createdAt: '2026-08-18T12:00:00.000Z',
      updatedAt: '2026-08-18T12:00:00.000Z',
    }] });
  });

  it('updates status and audits the transition', async () => {
    const response = await PATCH(new Request('http://localhost/api/admin/regression-cases/case-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateAiRegressionCaseStatus).toHaveBeenCalledWith('case-1', 'resolved');
    expect(mocks.recordAdminAudit).toHaveBeenCalledWith('admin-1', 'ai.regression-case.update', undefined, {
      regressionCaseId: 'case-1',
      status: 'resolved',
    });
  });
});
