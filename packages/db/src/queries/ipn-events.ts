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

// IPN (NOWPayments) webhook and checkout safety query helpers.

import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type IpnClaim =
  | { kind: 'claimed'; event: typeof schema.ipnEvents.$inferSelect }
  | { kind: 'processed' }
  | { kind: 'in_progress' };

/**
 * Atomically claim an IPN event for processing.
 *
 * A unique key protects against concurrent deliveries. Failed claims are
 * released and can be claimed again, while successful claims remain done.
 */
export async function claimIpnEvent(data: {
  nowpaymentsPaymentId: string;
  paymentStatus: string;
  bodyHash: string;
  rawBody: unknown;
}): Promise<IpnClaim> {
  const db = getDb();
  const [inserted] = await db
    .insert(schema.ipnEvents)
    .values({
      nowpaymentsPaymentId: data.nowpaymentsPaymentId,
      paymentStatus: data.paymentStatus,
      bodyHash: data.bodyHash,
      rawBody: data.rawBody,
      processing: true,
      processingAt: new Date(),
    })
    .onConflictDoNothing({
      target: [schema.ipnEvents.nowpaymentsPaymentId, schema.ipnEvents.paymentStatus],
    })
    .returning();

  if (inserted) return { kind: 'claimed', event: inserted };

  const [existing] = await db
    .select()
    .from(schema.ipnEvents)
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, data.nowpaymentsPaymentId),
        eq(schema.ipnEvents.paymentStatus, data.paymentStatus),
      ),
    )
    .limit(1);

  if (!existing || existing.processed) return { kind: 'processed' };
  const leaseExpired =
    existing.processing &&
    (!existing.processingAt || existing.processingAt < new Date(Date.now() - 5 * 60_000));
  if (existing.processing && !leaseExpired) return { kind: 'in_progress' };

  const [reclaimed] = await db
    .update(schema.ipnEvents)
    .set({
      processing: true,
      processingAt: new Date(),
      bodyHash: data.bodyHash,
      rawBody: data.rawBody,
      error: null,
      receivedAt: new Date(),
    })
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, data.nowpaymentsPaymentId),
        eq(schema.ipnEvents.paymentStatus, data.paymentStatus),
        eq(schema.ipnEvents.processed, false),
        or(
          eq(schema.ipnEvents.processing, false),
          isNull(schema.ipnEvents.processingAt),
          lt(schema.ipnEvents.processingAt, new Date(Date.now() - 5 * 60_000)),
        ),
      ),
    )
    .returning();

  return reclaimed ? { kind: 'claimed', event: reclaimed } : { kind: 'in_progress' };
}

/**
 * Legacy lookup retained for callers and operational tooling.
 */
export async function findIpnEvent(paymentId: string, paymentStatus: string) {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.ipnEvents)
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
        eq(schema.ipnEvents.paymentStatus, paymentStatus),
      ),
    )
    .limit(1);
  return existing[0] ?? null;
}

/** Insert an IPN event for legacy/manual callers. */
export async function insertIpnEvent(data: {
  nowpaymentsPaymentId: string;
  paymentStatus: string;
  bodyHash: string;
  rawBody: unknown;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.ipnEvents)
    .values(data)
    .onConflictDoNothing({
      target: [schema.ipnEvents.nowpaymentsPaymentId, schema.ipnEvents.paymentStatus],
    });
}

/** Mark a claimed IPN event as successfully processed. */
export async function markIpnProcessed(
  paymentId: string,
  paymentStatus: string,
  error: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.ipnEvents)
    .set({ processed: true, processing: false, processingAt: null, error, processedAt: new Date() })
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
        eq(schema.ipnEvents.paymentStatus, paymentStatus),
      ),
    );
}

/** Release a failed claim so a provider retry or operator replay can retry it. */
export async function markIpnFailed(
  paymentId: string,
  paymentStatus: string,
  error: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.ipnEvents)
    .set({ processed: false, processing: false, processingAt: null, error, processedAt: null })
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
        eq(schema.ipnEvents.paymentStatus, paymentStatus),
      ),
    );
}

/** Persist an authenticated webhook failure for manual replay. */
export async function recordBillingWebhookFailure(data: {
  eventType: string;
  eventId: string;
  payload: unknown;
  error: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.billingWebhookDlq)
    .values({
      provider: 'nowpayments',
      eventType: data.eventType,
      eventId: data.eventId,
      payload: data.payload,
      error: data.error,
    })
    .onConflictDoUpdate({
      target: [
        schema.billingWebhookDlq.provider,
        schema.billingWebhookDlq.eventId,
        schema.billingWebhookDlq.eventType,
      ],
      set: {
        payload: data.payload,
        error: data.error,
        status: 'pending',
        replayedAt: null,
        replayStartedAt: null,
        replayToken: null,
      },
    });
}

/** Count pending authenticated webhook failures older than the alert threshold. */
export async function countStaleBillingWebhookFailures(cutoff: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.billingWebhookDlq)
    .where(
      and(
        eq(schema.billingWebhookDlq.status, 'pending'),
        lt(schema.billingWebhookDlq.receivedAt, cutoff),
      ),
    );
  return Number(row?.count ?? 0);
}

/** Get one DLQ entry for an authenticated operator replay. */
export async function getBillingWebhookFailure(id: string) {
  const db = getDb();
  const [entry] = await db
    .select()
    .from(schema.billingWebhookDlq)
    .where(eq(schema.billingWebhookDlq.id, id))
    .limit(1);
  return entry ?? null;
}

/** Atomically reserve a pending DLQ entry for replay. */
export async function claimBillingWebhookReplay(id: string) {
  const db = getDb();
  const replayCutoff = new Date(Date.now() - 10 * 60_000);
  const replayToken = randomUUID();
  const [entry] = await db
    .update(schema.billingWebhookDlq)
    .set({ status: 'replaying', replayStartedAt: new Date(), replayToken })
    .where(
      and(
        eq(schema.billingWebhookDlq.id, id),
        or(
          eq(schema.billingWebhookDlq.status, 'pending'),
          and(
            eq(schema.billingWebhookDlq.status, 'replaying'),
            or(
              isNull(schema.billingWebhookDlq.replayStartedAt),
              lt(schema.billingWebhookDlq.replayStartedAt, replayCutoff),
            ),
          ),
        ),
      ),
    )
    .returning();
  return entry ?? null;
}

/** Mark a successfully replayed DLQ entry owned by this replay lease. */
export async function markBillingWebhookReplayed(id: string, replayToken: string): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(schema.billingWebhookDlq)
    .set({ status: 'replayed', replayedAt: new Date(), replayStartedAt: null, replayToken: null })
    .where(
      and(
        eq(schema.billingWebhookDlq.id, id),
        eq(schema.billingWebhookDlq.status, 'replaying'),
        eq(schema.billingWebhookDlq.replayToken, replayToken),
      ),
    )
    .returning();
  if (!updated) throw new Error('DLQ replay lease was lost before completion');
}

/** Release a failed replay owned by this replay lease back to the queue. */
export async function releaseBillingWebhookReplay(id: string, error: string, replayToken: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.billingWebhookDlq)
    .set({ status: 'pending', error, replayStartedAt: null, replayToken: null })
    .where(
      and(
        eq(schema.billingWebhookDlq.id, id),
        eq(schema.billingWebhookDlq.status, 'replaying'),
        eq(schema.billingWebhookDlq.replayToken, replayToken),
      ),
    );
}

/** Update a payment row status and associated fields. */
export async function updatePaymentStatus(
  paymentId: string,
  data: {
    status: string;
    nowpaymentsPaymentId?: string;
    txHash?: string | null;
    payAmount?: string | null;
    payCurrency?: string | null;
    ipnPayload?: unknown;
  },
): Promise<void> {
  const db = getDb();
  const updateData: Record<string, unknown> = {
    status: data.status,
    updatedAt: new Date(),
  };
  if (data.nowpaymentsPaymentId !== undefined) updateData.nowpaymentsPaymentId = data.nowpaymentsPaymentId;
  if (data.txHash !== undefined) updateData.txHash = data.txHash;
  if (data.payAmount !== undefined) updateData.payAmount = data.payAmount;
  if (data.payCurrency !== undefined) updateData.payCurrency = data.payCurrency;
  if (data.ipnPayload !== undefined) updateData.ipnPayload = data.ipnPayload;

  await db.update(schema.payments).set(updateData).where(eq(schema.payments.id, paymentId));
}

/**
 * Resolve a payment by provider payment ID and, when supplied, invoice ID.
 * If both identifiers resolve to different rows, reject the webhook instead
 * of allowing an ambiguous cross-invoice update.
 */
export async function getPaymentByNowpaymentsId(
  nowpaymentsPaymentId: string,
  nowpaymentsInvoiceId?: string,
) {
  const db = getDb();
  const [byPaymentId] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.nowpaymentsPaymentId, nowpaymentsPaymentId))
    .limit(1);

  if (!nowpaymentsInvoiceId) return byPaymentId ?? null;

  const [byInvoiceId] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.nowpaymentsInvoiceId, nowpaymentsInvoiceId))
    .limit(1);

  // Older payment rows may not have stored an invoice ID. In that case an
  // exact payment-ID match remains authoritative; reject only a proven
  // cross-row mismatch.
  if (byPaymentId && !byInvoiceId) return byPaymentId;
  if (byPaymentId && byInvoiceId && byPaymentId.id !== byInvoiceId.id) {
    throw new Error('NOWPayments payment ID and invoice ID refer to different payment rows');
  }
  return byInvoiceId ?? null;
}

/** Subscription status mapper from NOWPayments status. */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

/** Update subscription status based on payment outcome. */
export async function updateSubscriptionFromPayment(
  subscriptionId: string,
  paymentStatus: string,
  data?: { invoiceId?: string },
): Promise<void> {
  const db = getDb();

  switch (paymentStatus) {
    case 'finished':
    case 'confirmed': {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await db
        .update(schema.subscriptions)
        .set({
          status: 'active',
          currentPeriodEnd: periodEnd,
          ...(data?.invoiceId ? { nowpaymentsInvoiceId: data.invoiceId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptions.id, subscriptionId));
      break;
    }
    case 'failed':
    case 'expired':
      await db
        .update(schema.subscriptions)
        .set({ status: 'past_due', updatedAt: new Date() })
        .where(eq(schema.subscriptions.id, subscriptionId));
      break;
    case 'refunded':
      await db
        .update(schema.subscriptions)
        .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.subscriptions.id, subscriptionId));
      break;
  }
}
