/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
