// SPDX-License-Identifier: Apache-2.0

// POST /api/billing/checkout — create a NOWPayments invoice and return
// the hosted checkout URL.
// Auth required. Body: { planId: string } → { checkoutUrl: string }

import { z } from 'zod';

import { getPlan, upsertSubscription, createPayment } from '@hamafx/db';
import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getServerEnv } from '@/lib/env';
import { createInvoice } from '@/lib/nowpayments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CheckoutSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const body = await parseJsonBody(req, CheckoutSchema);
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

    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const orderId = `${user.userId}-${plan.id}-${Date.now()}`;
    const priceAmount = plan.priceUsdCents / 100;

    const invoice = await createInvoice({
      price_amount: priceAmount,
      price_currency: 'usd',
      pay_currency: plan.payCurrency ?? 'usdt',
      order_id: orderId,
      order_description: `${plan.name} subscription — HamaFX-Ai`,
      success_url: `${appUrl}/settings/billing?status=success`,
      cancelled_url: `${appUrl}/settings/billing?status=cancelled`,
    });

    const subscriptionId = await upsertSubscription(user.userId, {
      planId: plan.id,
      nowpaymentsInvoiceId: invoice.id,
    });

    await createPayment({
      subscriptionId,
      userId: user.userId,
      nowpaymentsPaymentId: invoice.id,
      nowpaymentsInvoiceId: invoice.id,
      payCurrency: plan.payCurrency ?? 'usdt',
    });

    return Response.json({ checkoutUrl: invoice.invoice_url });
  } catch (err) {
    return errorResponse(err, req);
  }
});
