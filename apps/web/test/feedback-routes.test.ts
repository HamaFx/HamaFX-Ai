// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockUpsertMessageFeedback,
  mockGetMessageFeedback,
  mockDeleteMessageFeedback,
  mockListFeedbackForReview,
  mockReviewMessageFeedback,
  mockRecordAdminAudit,
} = vi.hoisted(() => ({
  mockUpsertMessageFeedback: vi.fn(),
  mockGetMessageFeedback: vi.fn(),
  mockDeleteMessageFeedback: vi.fn(),
  mockListFeedbackForReview: vi.fn(),
  mockReviewMessageFeedback: vi.fn(),
  mockRecordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  withAuth: (handler: (req: Request, ctx: unknown) => Promise<Response>) =>
    (req: Request, ctx?: { params?: Promise<unknown> }) => handler(req, {
      params: ctx?.params ?? Promise.resolve({ threadId: 'thread-1', messageId: 'message-1' }),
      user: { userId: 'user-1' },
    }),
  parseJsonBody: async (req: Request, schema: { parse: (value: unknown) => unknown }) => schema.parse(await req.json()),
  parseSearchParams: (req: Request, schema: { parse: (value: unknown) => unknown }) => {
    const values: Record<string, string> = {};
    for (const [key, value] of new URL(req.url).searchParams.entries()) values[key] = value;
    return schema.parse(values);
  },
  errorResponse: (error: unknown) => Response.json({ error: { code: 'ERROR', message: String(error) } }, { status: 500 }),
}));

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: unknown) => Promise<Response>) =>
    (req: Request, ctx?: { params?: Promise<unknown> }) => handler(req, {
      params: ctx?.params ?? Promise.resolve({ id: 'feedback-1' }),
      user: { userId: 'admin-1', email: 'admin@example.com', name: 'Admin' },
    }),
}));

vi.mock('@/lib/services/api-boundary', () => ({
  upsertMessageFeedback: mockUpsertMessageFeedback,
  getMessageFeedback: mockGetMessageFeedback,
  deleteMessageFeedback: mockDeleteMessageFeedback,
  listFeedbackForReview: mockListFeedbackForReview,
  reviewMessageFeedback: mockReviewMessageFeedback,
}));

vi.mock('@/lib/services/admin', () => ({
  recordAdminAudit: mockRecordAdminAudit,
}));

import {
  GET as getUserFeedback,
  PUT as putUserFeedback,
  DELETE as deleteUserFeedback,
} from '@/app/api/chat/threads/[id]/messages/[messageId]/feedback/route';
import { GET as listAdminFeedback } from '@/app/api/admin/feedback/route';
import { PATCH as patchAdminFeedback } from '@/app/api/admin/feedback/[id]/route';

const row = {
  id: 'feedback-1',
  userId: 'user-1',
  threadId: 'thread-1',
  messageId: 'message-1',
  traceId: 'trace-1',
  rating: 'negative',
  userNote: 'The number was wrong',
  reviewStatus: 'unreviewed',
  reviewerId: null,
  reviewerLabel: null,
  issueCodes: null,
  reviewerNote: null,
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
  updatedAt: new Date('2026-08-16T00:00:00.000Z'),
};

describe('message feedback routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves a rating through the authenticated message route', async () => {
    mockUpsertMessageFeedback.mockResolvedValue(row);

    const response = await putUserFeedback(
      new Request('http://localhost/api/chat/threads/thread-1/messages/message-1/feedback', {
        method: 'PUT',
        body: JSON.stringify({ rating: 'negative', userNote: 'The number was wrong', traceId: 'trace-1' }),
      }),
      { params: Promise.resolve({ id: 'thread-1', messageId: 'message-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockUpsertMessageFeedback).toHaveBeenCalledWith({
      userId: 'user-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      rating: 'negative',
      userNote: 'The number was wrong',
      traceId: 'trace-1',
    });
    expect((await response.json()).feedback.rating).toBe('negative');
  });

  it('does not expose feedback from another user', async () => {
    mockGetMessageFeedback.mockResolvedValue(null);

    const response = await getUserFeedback(
      new Request('http://localhost/api/chat/threads/thread-1/messages/message-1/feedback'),
      { params: Promise.resolve({ id: 'thread-1', messageId: 'message-1' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).feedback).toBeNull();
  });

  it('deletes only the authenticated user feedback record', async () => {
    mockDeleteMessageFeedback.mockResolvedValue(true);

    const response = await deleteUserFeedback(
      new Request('http://localhost/api/chat/threads/thread-1/messages/message-1/feedback', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'thread-1', messageId: 'message-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockDeleteMessageFeedback).toHaveBeenCalledWith('user-1', 'thread-1', 'message-1');
    expect((await response.json()).deleted).toBe(true);
  });
});

describe('admin feedback review routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists review records without conversation content', async () => {
    mockListFeedbackForReview.mockResolvedValue([row]);

    const response = await listAdminFeedback(new Request('http://localhost/api/admin/feedback?status=unreviewed&limit=25'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockListFeedbackForReview).toHaveBeenCalledWith({ limit: 25, offset: 0, reviewStatus: 'unreviewed' });
    expect(body.feedback[0]).toEqual(expect.objectContaining({ id: 'feedback-1', messageId: 'message-1' }));
    expect(body.feedback[0]).not.toHaveProperty('assistantText');
  });

  it('persists reviewer classification and writes an admin audit record', async () => {
    mockReviewMessageFeedback.mockResolvedValue({ ...row, reviewStatus: 'reviewed', reviewerId: 'admin-1', reviewerLabel: 'fail', issueCodes: ['wrong_number'] });
    mockRecordAdminAudit.mockResolvedValue(undefined);

    const response = await patchAdminFeedback(
      new Request('http://localhost/api/admin/feedback/feedback-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'reviewed', label: 'fail', issueCodes: ['wrong_number'], reviewerNote: 'Check tool grounding' }),
      }),
      { params: Promise.resolve({ id: 'feedback-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockReviewMessageFeedback).toHaveBeenCalledWith({
      id: 'feedback-1',
      reviewerId: 'admin-1',
      status: 'reviewed',
      label: 'fail',
      issueCodes: ['wrong_number'],
      reviewerNote: 'Check tool grounding',
    });
    expect(mockRecordAdminAudit).toHaveBeenCalledWith('admin-1', 'ai.feedback.review', 'user-1', expect.objectContaining({ feedbackId: 'feedback-1' }));
  });
});
