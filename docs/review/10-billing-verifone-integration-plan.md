# 10 Billing Integration Plan (2Checkout / Verifone)

> **Target:** Multi-tenant SaaS Edition of HamaFX-Ai
> **Objective:** Gap analysis and integration plan for a new subscription billing system using 2Checkout (Verifone), intended to bypass Stripe's country restrictions for an Iraq-based business.

## 1. Context & Research Findings

The objective is to implement subscription billing, tracking usage limits (via `chat_telemetry`), and enforcing access using a Merchant of Record (MoR) to handle global payments, tax, and VAT compliance.

### [CRITICAL BLOCKER] Iraq Merchant Eligibility
**Finding:** 2Checkout (Verifone) **does not support** merchant accounts (2Sell/2Subscribe/2Monetize) based in Iraq.
* **Source:** 2Checkout's official "Restricted countries and territories" documentation and Payment Methods exclusions explicitly list Iraq among the countries where merchant accounts cannot be opened.
* **Competitor Check:** Both Paddle and Lemon Squeezy (alternative MoRs) also explicitly list Iraq as an unsupported/restricted country for merchant onboarding due to international compliance and AML regulations.
* **Action Required:** Before building *any* of this integration, the human owner MUST contact Verifone sales directly to request an exception or verify if a local entity proxy is required. If Verifone denies the account, local Iraqi payment aggregators (e.g., Rasedi, AmanExchange, NASS) exist, but they act as gateways, not full-service global MoRs (they do not automatically handle global VAT/Sales Tax compliance for digital SaaS goods).

### Verifone Capabilities (Assuming Eligibility is Resolved)
* **MoR & Tax:** 2Checkout acts as the Merchant of Record, automatically calculating and remitting global VAT/taxes for digital goods.
* **Subscriptions & Usage:** The platform supports recurring subscriptions and usage-based/metered billing (via the Usage Management API in SOAP/JSON-RPC v6).
* **Webhooks:** 2Checkout splits webhooks into **IPN** (Instant Payment Notification - for transactions/orders) and **LCN** (License Change Notification - for subscription lifecycle changes like renewals, past-due, and expirations).
* **PCI Scope:** Using **ConvertPlus** (Verifone's hosted checkout) keeps PCI DSS scope to a minimum (SAQ-A) because card data never touches the HamaFX-Ai servers. After checkout, users are redirected back via Header Redirect or Direct Return.
* **Authentication:** API calls require digest access authentication using the Merchant Code and a hash (HMAC SHA-256) of the current date and Merchant Code using the Secret Key. Webhooks are secured by an HMAC signature.

---

## 2. Proposed Database Schema

The app's tenancy model (`organization` table) maps 1:1 to users. We need to store subscription state, map Verifone product/subscription IDs to tenants, and implement the Dead Letter Queue (DLQ) required by `docs/BILLING-WEBHOOK-SAFETY-GATE.md`.

Create a new schema file: `packages/db/src/schema/billing.ts`

```typescript
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organization } from './auth';

/**
 * Maps a Verifone/2Checkout subscription to a HamaFX-Ai tenant.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text('tenant_id')
      .notNull()
      .unique()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    verifoneSubscriptionId: text('verifone_subscription_id').notNull().unique(),
    verifoneCustomerRef: text('verifone_customer_ref'),
    planCode: text('plan_code').notNull(),
    status: text('status').notNull(), // 'active', 'past_due', 'canceled', 'trial'
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: text('cancel_at_period_end').notNull().default('false'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index('subscriptions_tenant_id_idx').on(t.tenantId),
    index('subscriptions_verifone_id_idx').on(t.verifoneSubscriptionId),
  ]
);

/**
 * Idempotency tracking for 2Checkout webhooks (IPN & LCN).
 */
export const billingWebhookEvents = pgTable(
  'billing_webhook_events',
  {
    id: text('id').primaryKey(), // 2Checkout message/event ID
    provider: text('provider').notNull().default('2checkout'),
    eventType: text('event_type').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * Dead Letter Queue (DLQ) for failed webhook processing.
 * Required by BILLING-WEBHOOK-SAFETY-GATE.md.
 */
export const billingWebhookDlq = pgTable(
  'billing_webhook_dlq',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    provider: text('provider').notNull().default('2checkout'),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    error: text('error').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    replayedAt: timestamp('replayed_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'), // 'pending', 'replayed', 'discarded'
  }
);
```

---

## 3. Integration Design

### A. The Packages Architecture
Following `docs/review/09-open-core-architecture-review.md`:
* Create `packages/billing` (hosted-only). This isolates Verifone API clients and webhook parsing. If `HAMAFX_EDITION=self-host`, this package exports no-ops.
* `packages/tenancy` should handle reading the active subscription status and enforcing plan limits (e.g., overriding the global `UNLIMITED_SYMBOLS` with a per-tenant quota).

### B. Checkout Flow (ConvertPlus)
1. User clicks "Subscribe" in the UI.
2. The backend generates a **ConvertPlus Buy-Link** for the specific Plan/Product ID.
3. To attach the tenant context, append the `organization.id` to the buy-link as an external reference (`REFNOEXT` or a custom tracking parameter).
4. The user is redirected to the Verifone hosted checkout page.
5. Upon successful payment, Verifone redirects the user back to the app (using Header Redirect or Direct Return configured in the Verifone Merchant Control Panel).

### C. Webhook Handler (IPN & LCN)
Verifone delivers webhooks with aggressive retries (1, then 2 at 5 mins, 4 at 15 mins, then hourly for 2 days). The handler MUST be robust.

**Structure (`apps/web/src/app/api/webhooks/2checkout/route.ts`):**
1. **Signature Verification:** Compute the HMAC SHA-256 (or SHA3-256 based on configuration) of the incoming payload using the 2Checkout Secret Key. Reject mismatches with HTTP 401 and capture a `signature-failure` in Sentry.
2. **Idempotency Check:** Extract the `MESSAGE_ID` (for IPN) or LCN equivalent. Query `billing_webhook_events`. If it exists, return `200 OK` immediately (do not process again).
3. **Processing Logic:** 
   * **IPN `ORDERSTATUS = COMPLETE`:** Map `REFNOEXT` to `tenantId`. Create/update the `subscriptions` row to `active` and update `organization.plan`.
   * **LCN `LICENCE_EXPIRATION` / `LICENCE_PASTDUE`:** Update subscription status to `past_due` or `canceled`. Downgrade `organization.plan` to `free`.
4. **Error Handling (DLQ):** Catch all errors during processing. Insert the payload and error message into `billing_webhook_dlq`. Return `200 OK` to 2Checkout so they stop retrying a known-broken payload. Log to Sentry.

### D. Usage Reconciliation (AI Spend)
Since HamaFX tracks AI token costs in `chat_telemetry.est_cost_usd`, reconciling this with Verifone usage billing requires:
1. Configuring a "Metered Pricing" (pay-per-usage) option in the Verifone dashboard.
2. Running a daily cron job that aggregates `daily_ai_spend` for each tenant.
3. Calling the Verifone Usage Management API (`updateSubscriptionUsage` or JSON-RPC equivalent) to log the units consumed before the billing cycle ends.

---

## 4. Step-by-Step Implementation Plan

Follow this exact order to isolate risk and ensure the self-hosted core isn't broken.

1. **Verify Eligibility:** Have the business owner contact Verifone to confirm Iraq merchant eligibility. Do not write code until this is approved.
2. **Setup Sandbox:** Enable the 2Checkout Test System in the Merchant Control Panel. Generate Sandbox Merchant Code and Secret Keys.
3. **Scaffold Schema:** Add `subscriptions`, `billingWebhookEvents`, and `billingWebhookDlq` to `packages/db/src/schema/billing.ts`. Run `pnpm db:generate` and `pnpm db:migrate`.
4. **Build `packages/billing`:** Create the API client wrapper for Verifone (using REST/JSON-RPC v6) to generate Buy-Links and handle API authentication (Merchant Code + Hash).
5. **Implement Webhook Handler:** Build the Next.js route handler enforcing the `BILLING-WEBHOOK-SAFETY-GATE.md` rules: signature verification, DLQ insertion on failure, Sentry logging, and idempotency checks.
6. **Implement Checkout Redirect:** Add the API route that generates the ConvertPlus link (embedding `tenantId` as `REFNOEXT`) and redirects the user.
7. **Fulfill `billing-contract.test.ts`:** Write the Vitest suites replacing the `it.todo` placeholders in `apps/web/test/billing-contract.test.ts` to prove tenant isolation and idempotency work.
8. **Test Sandbox End-to-End:** Place a test order using a Verifone test credit card. Verify the IPN webhook is received, signature validates, subscription is created in the DB, and the tenant's plan upgrades.

---

## 5. Acceptance Criteria

* [ ] Verifone sales explicitly approves the merchant account for Iraq operation.
* [ ] A test ConvertPlus checkout redirects successfully, captures payment, and returns to the app.
* [ ] 2Checkout IPN webhooks for `COMPLETE` update the correct tenant's subscription status via `REFNOEXT` mapping.
* [ ] 2Checkout LCN webhooks for expiration correctly downgrade the tenant's plan.
* [ ] Webhook requests with invalid signatures are rejected with 401 and log to Sentry.
* [ ] Processing exceptions safely land in the `billing_webhook_dlq` table and return 200 to Verifone.
* [ ] Replaying the same webhook payload does not create duplicate DB records (idempotency).

---

## 6. Open Questions for the Human Owner

1. **Iraq Merchant Block:** My research shows 2Checkout/Verifone (along with Paddle and Lemon Squeezy) block merchant accounts from Iraq. Have you already secured a compliance exception with Verifone sales, or will you be using a foreign entity (e.g., UAE/US LLC) to open the account?
2. **Local Payment Alternatives:** If Verifone rejects the application, are you open to using local gateways (like Rasedi or AmanExchange)? *Note: Local gateways do not act as Merchant of Record, meaning you will be legally responsible for global SaaS tax/VAT calculations and remittance.*
3. **Usage Billing Granularity:** Do you plan to charge AI costs (from `daily_ai_spend`) dynamically at the end of the month via Verifone's Metered Usage API, or will you use flat-rate tiered plans (e.g., Pro = $20/mo with a hard cap)? Flat-rate is vastly simpler to implement for MVP.
4. **Trial Policy:** Will subscriptions offer a free trial (managed by Verifone), or does the "free" tenant tier serve as the trial?