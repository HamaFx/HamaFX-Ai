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

// IPN (NOWPayments) webhook query helpers.

import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

/**
 * Find an IPN event by payment ID + status (for idempotency check).
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

/**
 * Insert a new IPN event. Catches duplicate key errors gracefully.
 */
export async function insertIpnEvent(data: {
  nowpaymentsPaymentId: string;
  paymentStatus: string;
  bodyHash: string;
  rawBody: unknown;
}): Promise<void> {
  const db = getDb();
  try {
    await db.insert(schema.ipnEvents).values({
      nowpaymentsPaymentId: data.nowpaymentsPaymentId,
      paymentStatus: data.paymentStatus,
      bodyHash: data.bodyHash,
      rawBody: data.rawBody,
    });
  } catch (err) {
    if (String(err).includes('duplicate') || String(err).includes('unique')) {
      // Duplicate — concurrent insert, ignore
      return;
    }
    throw err;
  }
}

/**
 * Mark an IPN event as processed.
 */
export async function markIpnProcessed(
  paymentId: string,
  paymentStatus: string,
  error: string | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.ipnEvents)
    .set({ processed: true, error, processedAt: new Date() })
    .where(
      and(
        eq(schema.ipnEvents.nowpaymentsPaymentId, paymentId),
        eq(schema.ipnEvents.paymentStatus, paymentStatus),
      ),
    );
}

/**
 * Update a payment row status and associated fields.
 */
export async function updatePaymentStatus(
  paymentId: string,
  data: {
    status: string;
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
  if (data.txHash !== undefined) updateData.txHash = data.txHash;
  if (data.payAmount !== undefined) updateData.payAmount = data.payAmount;
  if (data.payCurrency !== undefined) updateData.payCurrency = data.payCurrency;
  if (data.ipnPayload !== undefined) updateData.ipnPayload = data.ipnPayload;

  await db.update(schema.payments).set(updateData).where(eq(schema.payments.id, paymentId));
}

/**
 * Get a payment by NOWPayments payment ID.
 */
export async function getPaymentByNowpaymentsId(nowpaymentsPaymentId: string) {
  const db = getDb();
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.nowpaymentsPaymentId, nowpaymentsPaymentId))
    .limit(1);
  return payment ?? null;
}

/** Subscription status mapper from NOWPayments status. */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

/**
 * Update subscription status based on payment outcome.
 */
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
