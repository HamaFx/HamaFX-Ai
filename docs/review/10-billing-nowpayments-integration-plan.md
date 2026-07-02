# 10 — Billing Integration Plan (NOWPayments / Crypto)

> **Type:** Implementation-ready handoff prompt for a coding agent.
> **Status:** Gap analysis and integration plan — no billing code exists in the repo today.
> **Date:** 2026-07-02 (revised from Verifone/2Checkout to NOWPayments)
> **Audience:** The engineer/agent who will implement the billing integration.

---

## 1. Context

HamaFX-Ai is being converted from a personal tool into a paid SaaS product for global
users. The business is based in Iraq, which creates a hard constraint: **Stripe, Paddle,
Lemon Squeezy, and PayPal do not support Iraq-based merchants** (Stripe: not on supported
countries list; Paddle: Iraq explicitly unsupported; Lemon Squeezy: Iraq not in payout
countries; PayPal: can send but cannot receive).

**2Checkout/Verifone** docs are genuinely conflicting — their FAQ lists Iraq under
"does not accept merchants from" for 2Sell/2Subscribe accounts, while a 2024 third-party
article shows ConvertPlus integrated with Shopify for Iraqi merchants. This is too
ambiguous to build on without a direct sales confirmation.

**Decision: Use NOWPayments (crypto payment processor) as the billing provider.**

NOWPayments was chosen because:
- **No country restrictions** — crypto-native, no merchant-of-record country requirements
- **Supports subscription/recurring billing** via their Recurring Payments API
- **Accepts 100+ cryptocurrencies** — global users can pay with BTC, ETH, USDT, USDC, etc.
- **Payout to Iraq is solved** — crypto → Binance P2P → IQD, or crypto → Payoneer/Wise → Iraqi bank
- **Developer-friendly REST API** with IPN webhooks for payment status notifications
- **No PCI DSS scope** — no card data ever touches our servers

The tenant model is: **tenant = individual user** (not org). This was decided in Phase 2.
The codebase already has multi-tenant scaffolding from Phase 3: `organization` /
`organization_member` tables, `tenant_id` columns on 22+ tables, `withTenantDb()` /
`getAdminDb()` helpers, RLS policies. See `docs/review/09-open-core-architecture-review.md`
for the full architectural context.

The app uses Apache 2.0 license, pnpm monorepo (apps/web Next.js 15, apps/worker Node.js,
packages/shared, packages/db, packages/ai, packages/data, packages/indicators,
packages/config). Database is Supabase Postgres with pgvector, Drizzle ORM.

Cost tracking exists in `chat_telemetry` table (see `packages/ai/src/telemetry/` and
`packages/shared/src/schemas/`).

---

## 2. Findings

### 2.1 NOWPayments Capabilities (verified from API docs)

**Authentication:**
- API key passed in `x-api-key` header for all REST API calls
- IPN (Instant Payment Notification) webhooks signed with HMAC-SHA512 using a shared
  IPN secret (set in NOWPayments dashboard). Signature is in the `x-nowpayments-sig`
  header, computed as `HMAC_SHA512(ipn_secret, sorted_json_body)`.
- Sandbox/test mode: NOWPayments provides a **sandbox API** at `api-sandbox.nowpayments.io`
  with the same endpoints — test with sandbox API key before going live.

**Payment flow:**
- Create invoice via `POST /v1/invoice` → returns a hosted checkout URL (or embeddable
  widget). User pays in their chosen crypto. NOWPayments handles the on-chain transaction,
  confirms it, and sends an IPN webhook with the final status.
- Statuses: `waiting` (invoice created, awaiting payment), `confirming` (payment received,
  awaiting blockchain confirmations), `confirmed` (payment confirmed on-chain),
  `sending` (payout to merchant in progress), `finished` (complete), `failed`, `expired`,
  `refunded`.

**Recurring/subscription billing:**
- NOWPayments offers a **Recurring Payments API** for subscription billing:
  - `POST /v1/recurring-payments` — create a recurring payment plan (amount, currency,
    interval, billing cycles)
  - Customer subscribes via a hosted checkout page
  - NOWPayments automatically charges the customer's saved payment method at each interval
  - IPN webhook fires for each recurring charge with the same status flow as one-time
    payments
- Alternatively, a **credit/prepaid balance model** can be used: customer tops up a
  balance, and the system deducts at each billing cycle. This is simpler but requires
  more app-side logic.

**Webhook (IPN) events:**
- NOWPayments sends a POST to your configured IPN URL for every status change
- Events are not typed by name — instead, the `payment_status` field in the JSON body
  indicates the event (`waiting`, `confirming`, `confirmed`, `sending`, `finished`,
  `failed`, `expired`, `refunded`)
- NOWPayments retries IPN delivery if your endpoint doesn't return HTTP 200
- **Idempotency:** the same IPN may be delivered more than once; the handler must be
  idempotent (deduplicate by `payment_id` + `payment_status`)

**Payouts:**
- NOWPayments settles to your configured crypto wallet address
- You withdraw crypto to Binance → P2P to IQD, or to Payoneer/Wise → Iraqi bank
- No fiat payout directly to Iraqi banks (same constraint as all processors for Iraq)

**Fees:**
- NOWPayments charges ~0.5–1% per transaction (depending on volume tier)
- No monthly fees, no setup fees

**Tax/VAT:**
- NOWPayments does **not** act as merchant of record and does **not** handle tax/VAT
  compliance. Since payments are in crypto, traditional VAT/sales tax collection is not
  automatically handled. This is a gap — see Open Questions §7.

### 2.2 Eligibility verification

- **Iraq merchant eligibility: ✅ Not an issue.** NOWPayments is crypto-native and does
  not restrict merchants by country. You sign up with an email and API key; no country-based
  merchant eligibility check. KYC may be required for higher volume tiers but does not
  block Iraq.
- **Global user payments: ✅ Supported.** Users from any country can pay with crypto.
  This covers 100% of the global audience that has access to any of the 100+ supported
  cryptocurrencies.

### 2.3 Integration points in the codebase

| Integration point | Location | What's needed |
|---|---|---|
| Database schema | `packages/db/src/schema/` | New tables: `plans`, `subscriptions`, `payments`, `ipn_events` |
| Auth/tenancy | `apps/web/src/middleware.ts`, `packages/db/src/client.ts` | Subscription status check in auth flow; gate features by plan |
| Webhook handler | `apps/web/src/app/api/` | New route: `POST /api/billing/webhook` (IPN receiver) |
| Checkout flow | `apps/web/src/app/` | New route: `GET /api/billing/checkout` (creates NOWPayments invoice, redirects) |
| Billing settings UI | `apps/web/src/app/(app)/settings/` | New page: plan selection, current subscription status, payment history |
| Worker job | `apps/worker/src/jobs/` | Optional: daily job to sync subscription status from NOWPayments API |
| Env vars | `apps/web/src/env.ts`, `.env.example` | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_API_BASE` |

---

## 3. Proposed Schema

New Drizzle ORM tables in `packages/db/src/schema/billing.ts`:

```typescript
import { pgTable, text, timestamp, integer, boolean, pgEnum, jsonb, uuid } from 'drizzle-orm/pg-core';

// ── Plans ──────────────────────────────────────────────────────────────────────

export const planInterval = pgEnum('plan_interval', ['monthly', 'quarterly', 'yearly']);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Human-readable name: "Free", "Pro", "Enterprise"
  name: text('name').notNull(),
  // NOWPayments recurring payment plan ID (null for the free tier)
  nowpaymentsPlanId: text('nowpayments_plan_id'),
  // Price in USD cents (for display/reference; actual charge is in crypto equivalent)
  priceUsdCents: integer('price_usd_cents').notNull().default(0),
  // Crypto currency the plan is billed in (e.g. 'usdt', 'btc')
  payCurrency: text('pay_currency').default('usdt'),
  interval: planInterval('interval').notNull().default('monthly'),
  // Feature flags gated by this plan (JSON array of feature keys)
  features: jsonb('features').$type<string[]>().default([]),
  // AI token/credit monthly cap (null = unlimited)
  monthlyTokenCap: integer('monthly_token_cap'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Subscriptions ──────────────────────────────────────────────────────────────

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',    // Free trial period active
  'active',      // Payment confirmed, subscription in good standing
  'past_due',    // Payment failed or expired, grace period
  'canceled',    // User or admin canceled
  'expired',     // Subscription ended, no further access
]);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),  // FK → organization.id
  planId: uuid('plan_id').notNull(),       // FK → plans.id
  status: subscriptionStatus('status').notNull().default('active'),
  // NOWPayments recurring payment ID (their internal reference)
  nowpaymentsRecurringId: text('nowpayments_recurring_id'),
  // NOWPayments invoice ID for the most recent payment
  nowpaymentsInvoiceId: text('nowpayments_invoice_id'),
  // When the current billing period ends
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  // When the trial ends (if trialing)
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  // Whether the user canceled (vs. system expiration)
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Payments (one row per IPN-confirmed payment) ───────────────────────────────

export const paymentStatus = pgEnum('payment_status', [
  'waiting',     // Invoice created, awaiting payment
  'confirming',  // Payment received, awaiting blockchain confirmations
  'confirmed',   // Confirmed on-chain
  'sending',     // Payout to merchant in progress
  'finished',    // Complete
  'failed',      // Payment failed
  'expired',     // Invoice expired without payment
  'refunded',    // Refunded
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id'),  // FK → subscriptions.id (null for one-time)
  tenantId: uuid('tenant_id').notNull(),     // FK → organization.id
  // NOWPayments payment ID (unique per payment attempt)
  nowpaymentsPaymentId: text('nowpayments_payment_id').notNull().unique(),
  // NOWPayments invoice ID
  nowpaymentsInvoiceId: text('nowpayments_invoice_id'),
  status: paymentStatus('status').notNull().default('waiting'),
  // Amount paid in crypto
  payAmount: text('pay_amount'),
  payCurrency: text('pay_currency'),
  // USD equivalent at time of payment (for accounting)
  usdAmount: integer('usd_amount_cents'),
  // Crypto transaction hash (for on-chain verification)
  txHash: text('tx_hash'),
  // Raw IPN payload (for audit trail)
  ipnPayload: jsonb('ipn_payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── IPN Event Log (idempotency + audit) ────────────────────────────────────────

export const ipnEvents = pgTable('ipn_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  // NOWPayments payment ID + status = unique idempotency key
  nowpaymentsPaymentId: text('nowpayments_payment_id').notNull(),
  paymentStatus: text('payment_status').notNull(),
  // SHA-256 of the raw body (dedup key)
  bodyHash: text('body_hash').notNull(),
  // Raw JSON body
  rawBody: jsonb('raw_body').notNull(),
  // Whether we successfully processed this event
  processed: boolean('processed').notNull().default(false),
  // Error message if processing failed
  error: text('error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});
```

**Migration:** `packages/db/drizzle/0040_phase8_billing_nowpayments.sql`

---

## 4. Proposed Integration Design

### 4.1 Checkout flow (hosted redirect)

```
User clicks "Upgrade to Pro"
  → POST /api/billing/checkout (auth required)
  → Server creates NOWPayments invoice via POST /v1/invoice
     (or POST /v1/recurring-payments for subscriptions)
  → Server stores invoice ID in payments table (status='waiting')
  → Server returns { checkoutUrl } to client
  → Client redirects to NOWPayments hosted checkout page
  → User pays with chosen crypto
  → NOWPayments sends IPN webhook → POST /api/billing/webhook
  → Server verifies HMAC-SHA512 signature
  → Server updates payments table + subscriptions table
  → User sees "Subscribed" on next page load
```

### 4.2 Webhook handler (`POST /api/billing/webhook`)

```typescript
// apps/web/src/app/api/billing/webhook/route.ts
// 1. Read raw body (needed for HMAC verification)
// 2. Verify x-nowpayments-sig header:
//    signature = HMAC_SHA512(ipn_secret, sorted_stringify(body))
//    if (signature !== header) return 401
// 3. Check idempotency: SELECT FROM ipn_events WHERE
//    nowpayments_payment_id = body.payment_id AND payment_status = body.payment_status
//    if exists and processed=true → return 200 (already handled)
// 4. INSERT INTO ipn_events (raw body, status)
// 5. Map payment_status to subscription action:
//    'finished' → set subscription.status='active', update current_period_end
//    'failed'   → set subscription.status='past_due'
//    'expired'  → set subscription.status='past_due'
//    'refunded' → set subscription.status='canceled'
// 6. UPDATE payments table with final status + tx_hash
// 7. Mark ipn_events.processed = true
// 8. Return 200 (must return 200 or NOWPayments retries)
```

**No auth middleware on the webhook route** — it's authenticated via HMAC signature
verification, not user session. Add it to the `withCronAuth` bypass list (or a new
`publicRoutes` list).

### 4.3 Subscription status check in auth flow

Add a check in `apps/web/src/middleware.ts` (or a server-side helper):
- On each authenticated request, check the user's subscription status
- If `status = 'active'` or `'trialing'` → allow access to gated features
- If `status = 'past_due'` → show a "payment required" banner but don't hard-block
  for a grace period (e.g. 7 days)
- If `status = 'expired'` or `'canceled'` → downgrade to free tier features

### 4.4 Feature gating

Use the `plans.features` JSON array to gate features:
```typescript
// packages/shared/src/billing/features.ts
export const PLAN_FEATURES = {
  free: ['chat_basic', 'chart_basic', 'journal_basic'],
  pro: ['chat_advanced', 'chart_advanced', 'journal_full', 'alerts_unlimited', 'ai_high_quota'],
  enterprise: ['chat_advanced', 'chart_advanced', 'journal_full', 'alerts_unlimited', 'ai_unlimited', 'api_access'],
} as const;

export function hasFeature(userPlan: string, feature: string): boolean {
  const features = PLAN_FEATURES[userPlan] ?? PLAN_FEATURES.free;
  return features.includes(feature);
}
```

### 4.5 Payout flow (Iraq-specific)

```
NOWPayments settles crypto → your configured wallet
  → Transfer USDT to Binance account
  → Binance P2P: sell USDT for IQD (very active market in Iraq)
  → Receive IQD to local bank account / cash

  OR

  → Transfer crypto to Payoneer (if supported) or Wise
  → Withdraw to FIB / KIB / RT Bank in Iraq
  → ATM withdrawal via Payoneer Mastercard (~$3.15/withdrawal)
```

---

## 5. Step-by-Step Implementation Plan

### Phase A — Sandbox setup (no production code yet)

1. Create a NOWPayments sandbox account at `api-sandbox.nowpayments.io`.
2. Generate a sandbox API key and IPN secret.
3. Test the API manually: create an invoice, simulate a payment, receive an IPN.
4. Add env vars to `.env.example`:
   ```
   # NOWPayments (crypto billing)
   NOWPAYMENTS_API_KEY=your_api_key
   NOWPAYMENTS_IPN_SECRET=your_ipn_secret
   NOWPAYMENTS_API_BASE=https://api-sandbox.nowpayments.io
   ```
5. Add env vars to `apps/web/src/env.ts` (zod schema, optional strings).

### Phase B — Database schema

6. Create `packages/db/src/schema/billing.ts` with the 4 tables above.
7. Export them from `packages/db/src/schema/index.ts`.
8. Generate migration: `pnpm --filter @hamafx/db drizzle-kit generate`.
9. Apply migration to local dev DB: `pnpm --filter @hamafx/db db:push`.
10. Seed 3 plans: Free ($0), Pro ($15/mo), Enterprise ($49/mo) — amounts are
    placeholders; owner must confirm actual pricing.

### Phase C — Webhook handler

11. Create `apps/web/src/app/api/billing/webhook/route.ts`:
    - Read raw body, verify HMAC-SHA512 signature
    - Idempotency check against `ipn_events` table
    - Update `payments` + `subscriptions` tables
    - Return 200 on success
12. Add `/api/billing/webhook` to the public routes list (no auth middleware).
13. Configure the IPN URL in NOWPayments dashboard: `https://yourdomain.com/api/billing/webhook`

### Phase D — Checkout flow

14. Create `apps/web/src/app/api/billing/checkout/route.ts`:
    - Auth required
    - Look up the plan by ID
    - Create NOWPayments invoice (or recurring payment) via their API
    - Store the invoice in `payments` table (status='waiting')
    - Return `{ checkoutUrl }` to client
15. Create `apps/web/src/app/api/billing/portal/route.ts`:
    - Auth required
    - Return the user's current subscription + payment history
16. Create the billing settings UI page at `apps/web/src/app/(app)/settings/billing/`:
    - Plan cards (Free / Pro / Enterprise)
    - "Upgrade" button → calls checkout API → redirects to NOWPayments
    - Current subscription status + next billing date
    - Payment history table

### Phase E — Feature gating

17. Create `packages/shared/src/billing/features.ts` with the feature map.
18. Add a `getSubscription(tenantId)` helper in `packages/db/src/queries/billing.ts`.
19. Wire feature checks into the chat route (AI token quota), alerts (unlimited vs.
    limited), and journal (full vs. basic).

### Phase F — Production cutover

20. Create a live NOWPayments account at `api.nowpayments.io`.
21. Generate production API key + IPN secret.
22. Set production env vars in Vercel.
23. Configure production IPN URL in NOWPayments dashboard.
24. Test end-to-end: create a test subscription, pay with a small crypto amount,
    verify webhook fires, verify subscription activates.
25. Test cancellation: cancel in NOWPayments, verify webhook updates status.
26. Test refund: issue refund in NOWPayments, verify webhook updates status.

---

## 6. Acceptance Criteria

1. **Sandbox:** A test subscription can be created, paid (test crypto), and the webhook
   fires within 30 seconds, activating the subscription in the database.
2. **Idempotency:** Replaying the same IPN webhook 3 times does not create duplicate
   `payments` rows or double-update the subscription.
3. **Signature verification:** Sending a webhook with a wrong signature returns 401 and
   does not modify any data.
4. **Cancellation:** Canceling a subscription in NOWPayments fires an IPN that sets
   `subscription.status = 'canceled'`.
5. **Feature gating:** A user on the Free plan cannot access Pro features; upgrading via
   checkout immediately unlocks them (after webhook confirms).
6. **Production:** A real crypto payment of the minimum amount activates a subscription
   end-to-end, and the crypto settles to the configured wallet.

---

## 7. Open Questions for the Human Owner

1. **Pricing tiers:** What are the actual USD prices for Free / Pro / Enterprise? (The
   schema uses placeholder amounts — $0 / $15 / $49 — confirm or change.)
2. **Trial period:** Should new signups get a free trial (e.g. 14 days of Pro)? If yes,
   how long, and does it require a payment method on file?
3. **Crypto currency options:** Which cryptocurrencies should be offered? USDT is the
   most stable for subscription pricing; BTC/ETH are popular but volatile. Recommend
   defaulting to USDT with optional BTC/ETH.
4. **Tax/VAT:** NOWPayments does not handle tax compliance (no merchant-of-record). Since
   payments are in crypto, traditional VAT/sales tax may not apply in the same way, but
   this should be confirmed with a tax advisor in your jurisdiction. See
   `docs/review/11-legal-compliance-review.md` §6 for related legal questions.
5. **Refund policy:** What is the refund policy? (e.g. 14-day money-back guarantee, no
   refunds after 14 days, prorated refunds?) NOWPayments supports refunds via their
   dashboard — the policy text needs to be written by a lawyer and displayed on the
   checkout page.
6. **Usage-based billing:** Should the Pro plan have a monthly AI token cap, or is it
   unlimited? If capped, should overage be charged or just hard-capped? The
   `chat_telemetry` table already tracks per-user AI cost — a daily worker job could
   check usage against the cap.
7. **Payout cadence:** How often will you withdraw crypto from NOWPayments to your
   wallet? (NOWPayments auto-settles to your configured wallet after each payment
   confirmation, so this is mainly about how often you convert crypto → IQD via
   Binance P2P.)

---

*Sources: NOWPayments API documentation at https://api-docs.nowpayments.io/,
BTCPay Server subscriptions docs at https://docs.btcpayserver.org/Subscriptions/,
Talent KRD Iraq payout guide at https://talent.krd/posts/how-to-get-paid-online-iraq.*
