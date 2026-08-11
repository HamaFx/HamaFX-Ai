// SPDX-License-Identifier: Apache-2.0

// POST /api/billing/webhook — NOWPayments IPN receiver.
// PUBLIC route — auth via HMAC-SHA512 signature, not user session.

import * as Sentry from '@sentry/nextjs';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  claimIpnEvent,
  getPaymentByNowpaymentsId,
  markIpnFailed,
  markIpnProcessed,
  recordBillingWebhookFailure,
  updatePaymentStatus,
  updateSubscriptionFromPayment,
} from '@hamafx/db';
import { getServerEnv } from '@/lib/env';
import { verifyIpnSignature } from '@/lib/nowpayments';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const providerIdentifier = z.preprocess(
  (value) => (typeof value === 'number' ? String(value) : value),
  z.string().min(1),
);
const optionalProviderIdentifier = z.preprocess(
  (value) => (typeof value === 'number' ? String(value) : value),
  z.string().min(1).nullable().optional(),
);

export const IpnPayloadSchema = z.object({
  payment_id: providerIdentifier,
  invoice_id: optionalProviderIdentifier.transform((value) => value ?? undefined),
  payment_status: z.enum(['waiting', 'confirming', 'confirmed', 'sending', 'finished', 'failed', 'expired', 'refunded']),
  pay_amount: z.string().optional(),
  pay_currency: z.string().optional(),
  price_amount: z.number().optional(),
  price_currency: z.string().optional(),
  order_id: z.string().optional(),
  order_description: z.string().optional(),
  txid: z.string().optional(),
}).passthrough();

export interface IpnPayload {
  payment_id: string;
  invoice_id?: string;
  payment_status: 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'finished' | 'failed' | 'expired' | 'refunded';
  pay_amount?: string;
  pay_currency?: string;
  price_amount?: number;
  price_currency?: string;
  order_id?: string;
  order_description?: string;
  txid?: string;
  [key: string]: unknown;
}

/**
 * Process a payload after signature verification and IPN claiming.
 * The admin DLQ replay endpoint uses this same path, preventing replay from
 * silently drifting from normal webhook accounting behavior.
 */
export async function processVerifiedIpnPayload(payload: IpnPayload): Promise<void> {
  const { payment_id, payment_status, invoice_id, txid, pay_amount, pay_currency } = payload;
  const payment = await getPaymentByNowpaymentsId(payment_id, invoice_id);

  if (!payment) {
    throw new Error('Payment row not found for IPN');
  }

  await updatePaymentStatus(payment.id, {
    status: mapPaymentStatus(payment_status),
    nowpaymentsPaymentId: payment_id,
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
    // Sentry Metrics aggregates this across serverless instances. Configure a
    // metric alert for >= 3 events in 5 minutes to page the operator; do not
    // use a process-local counter for this distributed security signal.
    Sentry.metrics.count('billing_webhook_signature_failure', 1, {
      attributes: { component: 'billing-webhook', provider: 'nowpayments' },
    });
    Sentry.captureMessage('Invalid NOWPayments IPN signature', {
      level: 'warning',
      tags: { component: 'billing-webhook', kind: 'signature-failure' },
      extra: { signaturePresent: Boolean(signature) },
    });
    logger.warn({ signaturePresent: !!signature }, 'Invalid IPN signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: IpnPayload;
  try {
    const parsed = IpnPayloadSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) throw new Error('invalid payload');
    payload = parsed.data as IpnPayload;
  } catch {
    logger.warn('Invalid JSON or unsupported fields in IPN body');
    return new Response('Bad Request', { status: 400 });
  }

  const { payment_id, payment_status } = payload;

  logger.info({ payment_id, payment_status, invoice_id: payload.invoice_id }, 'IPN received');
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const claim = await claimIpnEvent({
    nowpaymentsPaymentId: payment_id,
    paymentStatus: payment_status,
    bodyHash,
    rawBody: payload,
  });

  if (claim.kind === 'processed') {
    logger.info({ payment_id, payment_status }, 'IPN already processed, skipping');
    return new Response('OK', { status: 200 });
  }
  if (claim.kind === 'in_progress') {
    logger.info({ payment_id, payment_status }, 'IPN already being processed, acknowledging retry');
    return new Response('OK', { status: 200 });
  }

  try {
    await processVerifiedIpnPayload(payload);
    logger.info({ payment_id, payment_status }, 'IPN processed successfully');
    return new Response('OK', { status: 200 });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { component: 'billing-webhook', payment_id, payment_status },
      extra: { eventId: payment_id, eventType: payment_status },
    });
    logger.error({ err: error, payment_id, payment_status }, 'IPN processing failed');
    try {
      await recordBillingWebhookFailure({
        eventType: payment_status,
        eventId: payment_id,
        payload,
        error,
      });
      await markIpnFailed(payment_id, payment_status, error);
    } catch (dlqError) {
      Sentry.captureException(dlqError, {
        tags: { component: 'billing-webhook', kind: 'dlq-failure' },
        extra: { eventId: payment_id, eventType: payment_status },
      });
      logger.error({ err: String(dlqError), payment_id }, 'Failed to persist billing webhook DLQ entry');
      return new Response('Internal Server Error', { status: 500 });
    }
    // The event is authenticated and safely recorded for replay. A 200
    // prevents NOWPayments from retrying forever while preserving the failure.
    return new Response('OK', { status: 200 });
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
