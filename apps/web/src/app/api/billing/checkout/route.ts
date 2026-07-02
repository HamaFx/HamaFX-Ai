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

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';
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
    const db = getDb();

    const planRows = await db.select().from(schema.plans).where(eq(schema.plans.id, body.planId)).limit(1);

    if (planRows.length === 0) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, { status: 404 });
    }

    const plan = planRows[0];

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

    // Create or update subscription
    const existingSubs = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.tenantId, user.userId)).limit(1);

    let subscriptionId: string;

    if (existingSubs.length > 0) {
      const sub = existingSubs[0];
      await db.update(schema.subscriptions).set({
        planId: plan.id, status: 'active', nowpaymentsInvoiceId: invoice.id, updatedAt: new Date(),
      }).where(eq(schema.subscriptions.id, sub.id));
      subscriptionId = sub.id;
    } else {
      const [newSub] = await db.insert(schema.subscriptions).values({
        tenantId: user.userId, planId: plan.id, status: 'active', nowpaymentsInvoiceId: invoice.id,
      }).returning();
      subscriptionId = newSub.id;
    }

    await db.insert(schema.payments).values({
      subscriptionId, tenantId: user.userId,
      nowpaymentsPaymentId: invoice.id, nowpaymentsInvoiceId: invoice.id,
      status: 'waiting', payCurrency: plan.payCurrency ?? 'usdt',
    });

    return Response.json({ checkoutUrl: invoice.invoice_url });
  } catch (err) {
    return errorResponse(err, req);
  }
});
