// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetServerEnv = vi.hoisted(() => vi.fn());
const mockGetPlan = vi.hoisted(() => vi.fn());
const mockClaimCheckoutAttempt = vi.hoisted(() => vi.fn());
const mockCompleteCheckoutAttempt = vi.hoisted(() => vi.fn());
const mockCreatePayment = vi.hoisted(() => vi.fn());
const mockSaveCheckoutInvoice = vi.hoisted(() => vi.fn());
const mockFailCheckoutAttempt = vi.hoisted(() => vi.fn());
const mockCreateInvoice = vi.hoisted(() => vi.fn());
const mockVerifyIpnSignature = vi.hoisted(() => vi.fn());
const mockClaimIpnEvent = vi.hoisted(() => vi.fn());
const mockGetPaymentByNowpaymentsId = vi.hoisted(() => vi.fn());
const mockMarkIpnProcessed = vi.hoisted(() => vi.fn());
const mockMarkIpnFailed = vi.hoisted(() => vi.fn());
const mockRecordBillingWebhookFailure = vi.hoisted(() => vi.fn());
const mockUpdatePaymentStatus = vi.hoisted(() => vi.fn());
const mockUpdateSubscriptionFromPayment = vi.hoisted(() => vi.fn());
const mockClaimBillingWebhookReplay = vi.hoisted(() => vi.fn());
const mockMarkBillingWebhookReplayed = vi.hoisted(() => vi.fn());
const mockReleaseBillingWebhookReplay = vi.hoisted(() => vi.fn());
const mockCountStaleBillingWebhookFailures = vi.hoisted(() => vi.fn());
const mockCaptureException = vi.hoisted(() => vi.fn());
const mockCaptureMessage = vi.hoisted(() => vi.fn());
const mockMetricsCount = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: { user: { userId: string }; params: Promise<unknown> }) => Promise<Response>) =>
    (req: Request, ctx?: { params: Promise<unknown> }) =>
      handler(req, { user: { userId: 'admin-1' }, params: ctx?.params ?? Promise.resolve({}) }),
}));
vi.mock('@/lib/env', () => ({ getServerEnv: mockGetServerEnv }));
vi.mock('@/lib/nowpayments', () => ({
  createInvoice: mockCreateInvoice,
  verifyIpnSignature: mockVerifyIpnSignature,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  metrics: { count: mockMetricsCount },
}));
vi.mock('@hamafx/db', () => ({
  schema: {},
  claimCheckoutAttempt: mockClaimCheckoutAttempt,
  completeCheckoutAttempt: mockCompleteCheckoutAttempt,
  createPayment: mockCreatePayment,
  saveCheckoutInvoice: mockSaveCheckoutInvoice,
  failCheckoutAttempt: mockFailCheckoutAttempt,
  getPlan: mockGetPlan,
  upsertSubscription: vi.fn().mockResolvedValue('sub-1'),
  claimIpnEvent: mockClaimIpnEvent,
  getPaymentByNowpaymentsId: mockGetPaymentByNowpaymentsId,
  markIpnFailed: mockMarkIpnFailed,
  markIpnProcessed: mockMarkIpnProcessed,
  recordBillingWebhookFailure: mockRecordBillingWebhookFailure,
  updatePaymentStatus: mockUpdatePaymentStatus,
  updateSubscriptionFromPayment: mockUpdateSubscriptionFromPayment,
  claimBillingWebhookReplay: mockClaimBillingWebhookReplay,
  markBillingWebhookReplayed: mockMarkBillingWebhookReplayed,
  releaseBillingWebhookReplay: mockReleaseBillingWebhookReplay,
  countStaleBillingWebhookFailures: mockCountStaleBillingWebhookFailures,
}));

import { POST as checkout } from '@/app/api/billing/checkout/route';
import { POST as webhook } from '@/app/api/billing/webhook/route';
import { POST as replayDlq } from '@/app/api/admin/billing/dlq/[id]/replay/route';

const PLAN = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Pro',
  priceUsdCents: 1000,
  payCurrency: 'usdt',
};

const ATTEMPT = {
  id: 'attempt-1',
  tenantId: 'user-1',
  planId: PLAN.id,
  idempotencyKey: 'checkout-1',
  status: 'pending',
  invoiceId: null,
  checkoutUrl: null,
  error: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } });
  mockGetServerEnv.mockReturnValue({
    NOWPAYMENTS_API_KEY: 'api-key',
    NOWPAYMENTS_IPN_SECRET: 'ipn-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  });
  mockGetPlan.mockResolvedValue(PLAN);
  mockClaimCheckoutAttempt.mockResolvedValue({ kind: 'claimed', attempt: ATTEMPT });
  mockCompleteCheckoutAttempt.mockResolvedValue(undefined);
  mockCreatePayment.mockResolvedValue({ id: 'payment-1' });
  mockSaveCheckoutInvoice.mockResolvedValue(undefined);
  mockFailCheckoutAttempt.mockResolvedValue(undefined);
  mockCreateInvoice.mockResolvedValue({ id: 'invoice-1', invoice_url: 'https://pay.test/invoice-1' });
  mockVerifyIpnSignature.mockResolvedValue(true);
  mockClaimIpnEvent.mockResolvedValue({ kind: 'claimed', event: { id: 'event-1' } });
  mockGetPaymentByNowpaymentsId.mockResolvedValue({
    id: 'payment-1',
    txHash: null,
    payAmount: null,
    payCurrency: 'usdt',
    subscriptionId: 'sub-1',
  });
  mockMarkIpnProcessed.mockResolvedValue(undefined);
  mockMarkIpnFailed.mockResolvedValue(undefined);
  mockRecordBillingWebhookFailure.mockResolvedValue(undefined);
  mockUpdatePaymentStatus.mockResolvedValue(undefined);
  mockUpdateSubscriptionFromPayment.mockResolvedValue(undefined);
  mockClaimBillingWebhookReplay.mockResolvedValue({
    id: 'dlq-1',
    provider: 'nowpayments',
    status: 'replaying',
    replayToken: 'replay-token-1',
    payload: { payment_id: 'payment-1', payment_status: 'finished' },
  });
  mockMarkBillingWebhookReplayed.mockResolvedValue(undefined);
  mockReleaseBillingWebhookReplay.mockResolvedValue(undefined);
  mockCountStaleBillingWebhookFailures.mockResolvedValue(0);
});

describe('billing P1 safety gate', () => {
  it('requires Idempotency-Key before creating a checkout invoice', async () => {
    const response = await checkout(
      new Request('http://localhost/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId: PLAN.id }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(400);
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it('returns the stored checkout response on an idempotent retry', async () => {
    mockClaimCheckoutAttempt.mockResolvedValueOnce({
      kind: 'completed',
      attempt: { ...ATTEMPT, status: 'completed', invoiceId: 'invoice-1', checkoutUrl: 'https://pay.test/invoice-1' },
    });

    const response = await checkout(
      new Request('http://localhost/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId: PLAN.id }),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'checkout-1' },
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkoutUrl: 'https://pay.test/invoice-1',
      invoiceId: 'invoice-1',
      idempotent: true,
    });
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it('returns 409 while another checkout request owns the key', async () => {
    mockClaimCheckoutAttempt.mockResolvedValueOnce({ kind: 'in_progress' });

    const response = await checkout(
      new Request('http://localhost/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId: PLAN.id }),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'checkout-1' },
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(409);
    expect(mockCreateInvoice).not.toHaveBeenCalled();
  });

  it('resolves a webhook payment by invoice ID and stores the actual payment ID', async () => {
    const response = await webhook(
      new Request('http://localhost/api/billing/webhook', {
        method: 'POST',
        body: JSON.stringify({
          payment_id: 'payment-actual',
          invoice_id: 'invoice-1',
          payment_status: 'finished',
        }),
        headers: { 'x-nowpayments-sig': 'valid-signature' },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetPaymentByNowpaymentsId).toHaveBeenCalledWith('payment-actual', 'invoice-1');
    expect(mockUpdatePaymentStatus).toHaveBeenCalledWith(
      'payment-1',
      expect.objectContaining({ nowpaymentsPaymentId: 'payment-actual' }),
    );
  });

  it('records authenticated webhook processing failures in the DLQ and acknowledges them', async () => {
    mockUpdatePaymentStatus.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await webhook(
      new Request('http://localhost/api/billing/webhook', {
        method: 'POST',
        body: JSON.stringify({ payment_id: 'payment-1', payment_status: 'finished' }),
        headers: { 'x-nowpayments-sig': 'valid-signature' },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRecordBillingWebhookFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'payment-1',
        eventType: 'finished',
        error: 'database unavailable',
      }),
    );
    expect(mockMarkIpnFailed).toHaveBeenCalledWith('payment-1', 'finished', 'database unavailable');
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it('replays an authenticated DLQ entry through the canonical processor', async () => {
    const response = await replayDlq(
      new Request('http://localhost/api/admin/billing/dlq/dlq-1/replay', { method: 'POST' }),
      { params: Promise.resolve({ id: 'dlq-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockMarkBillingWebhookReplayed).toHaveBeenCalledWith('dlq-1', 'replay-token-1');
    expect(mockReleaseBillingWebhookReplay).not.toHaveBeenCalled();
  });

  it('captures invalid signatures and rejects them before parsing/claiming', async () => {
    mockVerifyIpnSignature.mockResolvedValueOnce(false);

    const response = await webhook(
      new Request('http://localhost/api/billing/webhook', {
        method: 'POST',
        body: '{"payment_id":"payment-1","payment_status":"finished"}',
        headers: { 'x-nowpayments-sig': 'invalid' },
      }),
    );

    expect(response.status).toBe(401);
    expect(mockMetricsCount).toHaveBeenCalledWith(
      'billing_webhook_signature_failure',
      1,
      expect.objectContaining({
        attributes: expect.objectContaining({ component: 'billing-webhook', provider: 'nowpayments' }),
      }),
    );
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Invalid NOWPayments IPN signature',
      expect.objectContaining({ tags: expect.objectContaining({ kind: 'signature-failure' }) }),
    );
    expect(mockClaimIpnEvent).not.toHaveBeenCalled();
  });
});
