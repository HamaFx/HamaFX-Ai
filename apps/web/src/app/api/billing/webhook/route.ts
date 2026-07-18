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

// POST /api/billing/webhook — NOWPayments IPN receiver.
// PUBLIC route — auth via HMAC-SHA512 signature, not user session.

import * as Sentry from '@sentry/nextjs';
import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';

import { getDb, schema } from '@hamafx/db';
import { getServerEnv } from '@/lib/env';
import { verifyIpnSignature } from '@/lib/nowpayments';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface IpnPayload {
  payment_id: string;
  invoice_id?: string;
  payment_status: string;
  pay_amount?: string;
  pay_currency?: string;
  price_amount?: number;
  price_currency?: string;
  order_id?: string;
  order_description?: string;
  txid?: string;
  [key: string]: unknown;
}

export async function POST(req: Request): Promise<Response> {
  const env = getServerEnv();
  const logger = createScopedLoggerWithContext({ component: 'billing-webhook' });

  const rawBody = await req.text();

  const signature = req.headers.get('x-nowpayments-sig') ?? '';
  const ipnSecret = env.NOWPAYMENTS_IPN_SECRET;

  if (!ipnSecret) {
    logger.error('NOWPAYMENTS_IPN_SECRET is not configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const isValid = await verifyIpnSignature(rawBody, signature, ipnSecret);
  if (!isValid) {
    logger.warn({ signaturePresent: !!signature }, 'Invalid IPN signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: IpnPayload;
  try {
    payload = JSON.parse(rawBody) as IpnPayload;
  } catch {
    logger.warn('Invalid JSON in IPN body');
    return new Response('Bad Request', { status: 400 });
  }

  const { payment_id, payment_status, invoice_id, txid, pay_amount, pay_currency } = payload;

  if (!payment_id || !payment_status) {
    logger.warn('Missing payment_id or payment_status in IPN');
    return new Response('Bad Request', { status: 400 });
  }

  logger.info({ payment_id, payment_status, invoice_id }, 'IPN received');

  const db = getDb();
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');

  // Idempotency check
  const existing = await db
    .select()
    .from(schema.ipnEvents)
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, payment_id),
        eq(schema.ipnEvents.paymentStatus, payment_status),
      ),
    )
    .limit(1);

  if (existing.length > 0 && existing[0]!.processed) {
    logger.info({ payment_id, payment_status }, 'IPN already processed, skipping');
    return new Response('OK', { status: 200 });
  }

  if (existing.length === 0) {
    try {
      await db.insert(schema.ipnEvents).values({
        nowpaymentsPaymentId: payment_id,
        paymentStatus: payment_status,
        bodyHash,
        rawBody: payload,
      });
    } catch (err) {
      if (String(err).includes('duplicate') || String(err).includes('unique')) {
        logger.info('IPN event already exists (concurrent), skipping insert');
      } else {
        throw err;
      }
    }
  }

  try {
    const paymentRows = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.nowpaymentsPaymentId, payment_id))
      .limit(1);

    if (paymentRows.length === 0) {
      logger.warn({ payment_id }, 'Payment row not found for IPN');
      await markIpnProcessed(db, payment_id, payment_status, 'Payment row not found');
      return new Response('OK', { status: 200 });
    }

    const payment = paymentRows[0]!;

    await db
      .update(schema.payments)
      .set({
        status: mapPaymentStatus(payment_status),
        txHash: txid ?? payment.txHash,
        payAmount: pay_amount ?? payment.payAmount,
        payCurrency: pay_currency ?? payment.payCurrency,
        ipnPayload: payload,
        updatedAt: new Date(),
      })
      .where(eq(schema.payments.id, payment.id));

    if (payment.subscriptionId) {
      await updateSubscriptionStatus(db, payment.subscriptionId, payment_status, payload);
    }

    await markIpnProcessed(db, payment_id, payment_status, null);
    logger.info({ payment_id, payment_status }, 'IPN processed successfully');

    return new Response('OK', { status: 200 });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'billing-webhook', payment_id, payment_status },
    });
    logger.error({ err: String(err), payment_id, payment_status }, 'IPN processing failed');
    await markIpnProcessed(db, payment_id, payment_status, String(err));
    return new Response('Internal Server Error', { status: 500 });
  }
}

function mapPaymentStatus(npStatus: string): 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'finished' | 'failed' | 'expired' | 'refunded' {
  const map: Record<string, string> = {
    waiting: 'waiting', confirming: 'confirming', confirmed: 'confirmed',
    sending: 'sending', finished: 'finished', failed: 'failed',
    expired: 'expired', refunded: 'refunded',
  };
  return (map[npStatus] ?? 'waiting') as 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'finished' | 'failed' | 'expired' | 'refunded';
}

async function updateSubscriptionStatus(db: ReturnType<typeof getDb>, subscriptionId: string, paymentStatus: string, payload: IpnPayload): Promise<void> {
  switch (paymentStatus) {
    case 'finished':
    case 'confirmed': {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await db.update(schema.subscriptions).set({
        status: 'active',
        currentPeriodEnd: periodEnd,
        nowpaymentsInvoiceId: payload.invoice_id ?? null,
        updatedAt: new Date(),
      }).where(eq(schema.subscriptions.id, subscriptionId));
      break;
    }
    case 'failed':
    case 'expired': {
      await db.update(schema.subscriptions).set({
        status: 'past_due', updatedAt: new Date(),
      }).where(eq(schema.subscriptions.id, subscriptionId));
      break;
    }
    case 'refunded': {
      await db.update(schema.subscriptions).set({
        status: 'canceled', canceledAt: new Date(), updatedAt: new Date(),
      }).where(eq(schema.subscriptions.id, subscriptionId));
      break;
    }
    default: break;
  }
}

async function markIpnProcessed(db: ReturnType<typeof getDb>, paymentId: string, paymentStatus: string, error: string | null): Promise<void> {
  await db.update(schema.ipnEvents).set({
    processed: true, error, processedAt: new Date(),
  }).where(and(
    eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
    eq(schema.ipnEvents.paymentStatus, paymentStatus),
  ));
}
