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

import { findIpnEvent, insertIpnEvent, markIpnProcessed, getPaymentByNowpaymentsId, updatePaymentStatus, updateSubscriptionFromPayment } from '@hamafx/db';
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

  const bodyHash = createHash('sha256').update(rawBody).digest('hex');

  // Idempotency check
  const existing = await findIpnEvent(payment_id, payment_status);

  if (existing && existing.processed) {
    logger.info({ payment_id, payment_status }, 'IPN already processed, skipping');
    return new Response('OK', { status: 200 });
  }

  if (!existing) {
    await insertIpnEvent({
      nowpaymentsPaymentId: payment_id,
      paymentStatus: payment_status,
      bodyHash,
      rawBody: payload,
    });
  }

  try {
    const payment = await getPaymentByNowpaymentsId(payment_id);

    if (!payment) {
      logger.warn({ payment_id }, 'Payment row not found for IPN');
      await markIpnProcessed(payment_id, payment_status, 'Payment row not found');
      return new Response('OK', { status: 200 });
    }

    await updatePaymentStatus(payment.id, {
      status: mapPaymentStatus(payment_status),
      txHash: txid ?? payment.txHash,
      payAmount: pay_amount ?? payment.payAmount,
      payCurrency: pay_currency ?? payment.payCurrency,
      ipnPayload: payload,
    });

    if (payment.subscriptionId) {
      await updateSubscriptionFromPayment(payment.subscriptionId, payment_status, {
        ...(invoice_id ? { invoiceId: invoice_id } : {}),
      });
    }

    await markIpnProcessed(payment_id, payment_status, null);
    logger.info({ payment_id, payment_status }, 'IPN processed successfully');

    return new Response('OK', { status: 200 });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'billing-webhook', payment_id, payment_status },
    });
    logger.error({ err: String(err), payment_id, payment_status }, 'IPN processing failed');
    await markIpnProcessed(payment_id, payment_status, String(err));
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


