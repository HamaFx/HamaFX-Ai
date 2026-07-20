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

// Billing query helpers — plans, subscriptions, payments.

import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '../client';

/** Get all active plans. */
export async function listActivePlans() {
  const db = getDb();
  return db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.isActive, true));
}

/** Get a single plan by ID. Returns null if not found. */
export async function getPlan(planId: string) {
  const db = getDb();
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId))
    .limit(1);
  return plan ?? null;
}

/** Get a user's subscription. Returns null if not subscribed. */
export async function getUserSubscription(userId: string) {
  const db = getDb();
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, userId))
    .limit(1);
  return sub ?? null;
}

/** Get a user's payment history, newest first, limited to `limit` rows. */
export async function getUserPayments(userId: string, limit: number = 50) {
  const db = getDb();
  return db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.tenantId, userId))
    .orderBy(desc(schema.payments.createdAt))
    .limit(limit);
}

/**
 * Upsert a subscription for a user. If one exists, update it; otherwise create it.
 * Returns the subscription ID.
 */
export async function upsertSubscription(
  userId: string,
  data: { planId: string; nowpaymentsInvoiceId: string },
): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, userId))
    .limit(1);

  if (existing.length > 0) {
    const sub = existing[0]!;
    await db
      .update(schema.subscriptions)
      .set({
        planId: data.planId,
        status: 'active',
        nowpaymentsInvoiceId: data.nowpaymentsInvoiceId,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, sub.id));
    return sub.id;
  }

  const [newSub] = await db
    .insert(schema.subscriptions)
    .values({
      tenantId: userId,
      planId: data.planId,
      status: 'active',
      nowpaymentsInvoiceId: data.nowpaymentsInvoiceId,
    })
    .returning();
  return newSub!.id;
}

/**
 * Create a new payment record.
 */
export async function createPayment(data: {
  subscriptionId: string;
  userId: string;
  nowpaymentsPaymentId: string;
  nowpaymentsInvoiceId: string;
  payCurrency: string;
}) {
  const db = getDb();
  const [payment] = await db
    .insert(schema.payments)
    .values({
      subscriptionId: data.subscriptionId,
      tenantId: data.userId,
      nowpaymentsPaymentId: data.nowpaymentsPaymentId,
      nowpaymentsInvoiceId: data.nowpaymentsInvoiceId,
      status: 'waiting',
      payCurrency: data.payCurrency,
    })
    .returning();
  return payment!;
}
