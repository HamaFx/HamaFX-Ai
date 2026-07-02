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

// Phase B — Billing schema (NOWPayments / crypto).
//
// Four tables:
//   plans           — product tiers (Free, Pro, Enterprise)
//   subscriptions   — per-tenant subscription state
//   payments        — one row per IPN-confirmed payment
//   ipn_events      — idempotency + audit log for NOWPayments webhooks
//
// See docs/review/10-billing-nowpayments-integration-plan.md for the full
// integration design and acceptance criteria.

import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { organization } from './auth';

// ── Enums ─────────────────────────────────────────────────────────────────

export const planInterval = pgEnum('plan_interval', ['monthly', 'quarterly', 'yearly']);

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing', // Free trial period active
  'active', // Payment confirmed, subscription in good standing
  'past_due', // Payment failed or expired, grace period
  'canceled', // User or admin canceled
  'expired', // Subscription ended, no further access
]);

export const paymentStatus = pgEnum('payment_status', [
  'waiting', // Invoice created, awaiting payment
  'confirming', // Payment received, awaiting blockchain confirmations
  'confirmed', // Confirmed on-chain
  'sending', // Payout to merchant in progress
  'finished', // Complete
  'failed', // Payment failed
  'expired', // Invoice expired without payment
  'refunded', // Refunded
]);

// ── Plans ─────────────────────────────────────────────────────────────────

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-readable name: "Free", "Pro", "Enterprise" */
    name: text('name').notNull(),
    /** NOWPayments recurring payment plan ID (null for the free tier) */
    nowpaymentsPlanId: text('nowpayments_plan_id'),
    /** Price in USD cents (for display/reference; actual charge is in crypto equivalent) */
    priceUsdCents: integer('price_usd_cents').notNull().default(0),
    /** Crypto currency the plan is billed in (e.g. 'usdt', 'btc') */
    payCurrency: text('pay_currency').default('usdt'),
    interval: planInterval('interval').notNull().default('monthly'),
    /** Feature flags gated by this plan (JSON array of feature keys) */
    features: jsonb('features').$type<string[]>().default([]),
    /** AI token/credit monthly cap (null = unlimited) */
    monthlyTokenCap: integer('monthly_token_cap'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('plans_name_idx').on(t.name)],
);

// ── Subscriptions ─────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** FK → organization.id (tenant = individual user) */
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** FK → plans.id */
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: subscriptionStatus('status').notNull().default('active'),
    /** NOWPayments recurring payment ID (their internal reference) */
    nowpaymentsRecurringId: text('nowpayments_recurring_id'),
    /** NOWPayments invoice ID for the most recent payment */
    nowpaymentsInvoiceId: text('nowpayments_invoice_id'),
    /** When the current billing period ends */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** When the trial ends (if trialing) */
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    /** Whether the user canceled (vs. system expiration) */
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscriptions_tenant_idx').on(t.tenantId),
    uniqueIndex('subscriptions_tenant_active_idx').on(t.tenantId, t.status),
  ],
);

// ── Payments (one row per IPN-confirmed payment) ──────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** FK → subscriptions.id (null for one-time payments) */
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    /** FK → organization.id */
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** NOWPayments payment ID (unique per payment attempt) */
    nowpaymentsPaymentId: text('nowpayments_payment_id').notNull().unique(),
    /** NOWPayments invoice ID */
    nowpaymentsInvoiceId: text('nowpayments_invoice_id'),
    status: paymentStatus('status').notNull().default('waiting'),
    /** Amount paid in crypto */
    payAmount: text('pay_amount'),
    payCurrency: text('pay_currency'),
    /** USD equivalent at time of payment in cents (for accounting) */
    usdAmountCents: integer('usd_amount_cents'),
    /** Crypto transaction hash (for on-chain verification) */
    txHash: text('tx_hash'),
    /** Raw IPN payload (for audit trail) */
    ipnPayload: jsonb('ipn_payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_subscription_idx').on(t.subscriptionId),
    index('payments_tenant_idx').on(t.tenantId),
    index('payments_status_idx').on(t.status),
  ],
);

// ── IPN Event Log (idempotency + audit) ───────────────────────────────────

export const ipnEvents = pgTable(
  'ipn_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NOWPayments payment ID + status = unique idempotency key */
    nowpaymentsPaymentId: text('nowpayments_payment_id').notNull(),
    paymentStatus: text('payment_status').notNull(),
    /** SHA-256 of the raw body (dedup key) */
    bodyHash: text('body_hash').notNull(),
    /** Raw JSON body */
    rawBody: jsonb('raw_body').notNull(),
    /** Whether we successfully processed this event */
    processed: boolean('processed').notNull().default(false),
    /** Error message if processing failed */
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('ipn_events_idempotency_idx').on(t.nowpaymentsPaymentId, t.paymentStatus),
    index('ipn_events_processed_idx').on(t.processed),
  ],
);

// ── Type exports ──────────────────────────────────────────────────────────

export type PlanRow = typeof plans.$inferSelect;
export type PlanInsert = typeof plans.$inferInsert;

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type SubscriptionInsert = typeof subscriptions.$inferInsert;

export type PaymentRow = typeof payments.$inferSelect;
export type PaymentInsert = typeof payments.$inferInsert;

export type IpnEventRow = typeof ipnEvents.$inferSelect;
export type IpnEventInsert = typeof ipnEvents.$inferInsert;
