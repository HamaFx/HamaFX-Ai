// SPDX-License-Identifier: Apache-2.0

// POST /api/billing/checkout — create a NOWPayments invoice and return
// the hosted checkout URL.
// Auth required. Body: { planId: string } → { checkoutUrl: string }

import { z } from 'zod';

import {
  claimCheckoutAttempt,
  completeCheckoutAttempt,
  createPayment,
  failCheckoutAttempt,
  getPlan,
  saveCheckoutInvoice,
  upsertSubscription,
} from '@/lib/services/api-boundary';
import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createInvoice } from '@/lib/nowpayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CheckoutSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
});

const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const body = await parseJsonBody(req, CheckoutSchema);
    const idempotencyKey = req.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      return Response.json(
        { error: { code: 'VALIDATION', message: 'A valid Idempotency-Key header is required' } },
        { status: 400 },
      );
    }
    const env = getServerEnv();

    const plan = await getPlan(body.planId);

    if (!plan) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, { status: 404 });
    }

    if (plan.priceUsdCents === 0) {
      return Response.json({ error: { code: 'BAD_REQUEST', message: 'Free plan does not require checkout' } }, { status: 400 });
    }

    if (!env.NOWPAYMENTS_API_KEY) {
      return Response.json({ error: { code: 'NOT_CONFIGURED', message: 'Billing is not configured' } }, { status: 503 });
    }

    const claim = await claimCheckoutAttempt({
      userId: user.userId,
      planId: plan.id,
      idempotencyKey,
    });

    if (claim.kind === 'completed') {
      return Response.json({
        checkoutUrl: claim.attempt.checkoutUrl,
        invoiceId: claim.attempt.invoiceId,
        idempotent: true,
      });
    }
    if (claim.kind === 'in_progress') {
      return Response.json(
        { error: { code: 'CONFLICT', message: 'Checkout is already being created for this Idempotency-Key' } },
        { status: 409 },
      );
    }
    if (claim.kind === 'conflict') {
      return Response.json(
        { error: { code: 'CONFLICT', message: 'Idempotency-Key was already used for another plan' } },
        { status: 409 },
      );
    }

    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const orderId = `${user.userId}-${plan.id}-${idempotencyKey}`;
    const priceAmount = plan.priceUsdCents / 100;

    try {
      const recoveredInvoice =
        claim.kind === 'claimed' &&
        claim.attempt.invoiceId &&
        claim.attempt.checkoutUrl
          ? {
              id: claim.attempt.invoiceId,
              invoice_url: claim.attempt.checkoutUrl,
            }
          : null;
      const invoice = recoveredInvoice ?? (await createInvoice({
        price_amount: priceAmount,
        price_currency: 'usd',
        pay_currency: plan.payCurrency ?? 'usdt',
        order_id: orderId,
        order_description: `${plan.name} subscription — HamaFX-Ai`,
        success_url: `${appUrl}/settings/billing?status=success`,
        cancelled_url: `${appUrl}/settings/billing?status=cancelled`,
      }));

      if (!recoveredInvoice) {
        await saveCheckoutInvoice({
          attemptId: claim.attempt.id,
          invoiceId: invoice.id,
          checkoutUrl: invoice.invoice_url,
          processingToken: claim.attempt.processingToken!,
        });
      }

      const subscriptionId = await upsertSubscription(user.userId, {
        planId: plan.id,
        nowpaymentsInvoiceId: invoice.id,
      });

      await createPayment({
        subscriptionId,
        userId: user.userId,
        nowpaymentsInvoiceId: invoice.id,
        payCurrency: plan.payCurrency ?? 'usdt',
      });

      await completeCheckoutAttempt({
        attemptId: claim.attempt.id,
        invoiceId: invoice.id,
        checkoutUrl: invoice.invoice_url,
        processingToken: claim.attempt.processingToken!,
      });

      return Response.json({ checkoutUrl: invoice.invoice_url, invoiceId: invoice.id });
    } catch (err) {
      await failCheckoutAttempt(
        claim.attempt.id,
        err instanceof Error ? err.message : String(err),
        claim.attempt.processingToken!,
      );
      throw err;
    }
  } catch (err) {
    return errorResponse(err, req);
  }
});
