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

// Phase E — Billing query helpers.
//
// These functions provide a cached lookup of a tenant's active subscription
// and associated plan, used by feature gating checks across the app.

import { eq, and, desc } from 'drizzle-orm';

import { getDb, schema } from '../index';

export interface SubscriptionWithPlan {
  id: string;
  tenantId: string;
  planId: string;
  status: string;
  nowpaymentsRecurringId: string | null;
  nowpaymentsInvoiceId: string | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  plan: {
    id: string;
    name: string;
    priceUsdCents: number;
    features: string[] | null;
    monthlyTokenCap: number | null;
    interval: string;
  } | null;
}

/**
 * Get the active subscription for a tenant, with the associated plan details.
 *
 * Returns null if the tenant has no subscription (treated as Free tier).
 * Returns the subscription even if status is 'past_due' or 'trialing' —
 * the caller decides how to handle those states.
 */
export async function getSubscription(tenantId: string): Promise<SubscriptionWithPlan | null> {
  const db = getDb();

  const subs = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, tenantId))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);

  if (subs.length === 0) return null;

  const sub = subs[0]!;

  // Fetch the associated plan.
  const plans = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, sub.planId))
    .limit(1);

  const plan = plans[0] ?? null;

  const result: SubscriptionWithPlan = {
    id: sub.id,
    tenantId: sub.tenantId,
    planId: sub.planId,
    status: sub.status,
    nowpaymentsRecurringId: sub.nowpaymentsRecurringId,
    nowpaymentsInvoiceId: sub.nowpaymentsInvoiceId,
    currentPeriodEnd: sub.currentPeriodEnd,
    trialEnd: sub.trialEnd,
    canceledAt: sub.canceledAt,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt,
    plan,
  };

  return result;
}

/**
 * Check if a tenant has an active (or trialing) subscription.
 * Past_due subscriptions are considered inactive for gating purposes
 * after a grace period (checked by the caller).
 */
export function isSubscriptionActive(sub: SubscriptionWithPlan | null): boolean {
  if (!sub) return false;
  return sub.status === 'active' || sub.status === 'trialing';
}

/**
 * Get the effective features for a tenant.
 *
 * If the tenant has an active subscription, returns the plan's features.
 * Otherwise, returns the free tier features.
 */
export function getEffectiveFeatures(sub: SubscriptionWithPlan | null): string[] {
  if (sub && isSubscriptionActive(sub) && sub.plan?.features) {
    return sub.plan.features;
  }
  // Free tier default
  return ['chat_basic', 'chart_basic', 'journal_basic'];
}

/**
 * Get the monthly token cap for a tenant.
 *
 * Returns null for unlimited (Enterprise or uncapped plans).
 * Returns the plan's monthlyTokenCap if the subscription is active.
 * Returns a default free-tier cap (100,000) if no active subscription.
 */
export function getEffectiveTokenCap(sub: SubscriptionWithPlan | null): number | null {
  if (sub && isSubscriptionActive(sub) && sub.plan) {
    return sub.plan.monthlyTokenCap ?? null;
  }
  // Free tier default: 100K tokens/month
  return 100_000;
}

/**
 * Count active alerts for a tenant. Used to enforce the free-tier alert limit.
 */
export async function countActiveAlerts(tenantId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: schema.alerts.id })
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.tenantId, tenantId),
        eq(schema.alerts.active, true),
      ),
    );
  return result.length;
}

/**
 * Count journal entries for a tenant in the current calendar month.
 * Used to enforce the free-tier journal monthly limit.
 */
export async function countJournalEntriesThisMonth(tenantId: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await db
    .select({ id: schema.journalEntries.id })
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.tenantId, tenantId),
        eq(schema.journalEntries.openedAt, monthStart),
      ),
    );
  return result.length;
}
