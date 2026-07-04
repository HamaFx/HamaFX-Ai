# 12 — Billing Production Cutover Runbook (Phase F)

> **Type:** Operational runbook for going live with NOWPayments billing.
> **Status:** Ready — execute after Phase A-E are merged and tested in sandbox.
> **Date:** 2026-07-02

---

## Prerequisites

- [ ] Phase A-E PR merged to `main`
- [ ] Migration `0040_phase8_billing_nowpayments.sql` applied to production DB
- [ ] Plans seeded via `pnpm --filter @hamafx/db seed:plans`
- [ ] Sandbox testing completed (§6 acceptance criteria 1-5 from plan doc)

---

## Step 1 — Create Live NOWPayments Account

1. Go to https://nowpayments.io and sign up for a **production** account
   (separate from the sandbox account).
2. Complete KYC verification (required for higher volume tiers).
3. Generate a **production API key** from the dashboard:
   - Dashboard → API Keys → Create New Key
   - Copy the key immediately (shown only once).
4. Set the **IPN secret** in the dashboard:
   - Dashboard → Settings → IPN Settings
   - Set IPN URL to: `https://yourdomain.com/api/billing/webhook`
   - Generate and copy the IPN secret.

## Step 2 — Configure Production Environment Variables

Set these in Vercel (Settings → Environment Variables → Production scope):

```
NOWPAYMENTS_API_KEY=<production API key>
NOWPAYMENTS_IPN_SECRET=<production IPN secret>
NOWPAYMENTS_API_BASE=https://api.nowpayments.io
```

> **IMPORTANT:** Change `NOWPAYMENTS_API_BASE` from sandbox to `https://api.nowpayments.io`.

## Step 3 — Create Recurring Payment Plans in NOWPayments

For each paid plan (Pro, Enterprise):

1. Call `POST /v1/recurring-payments` via the NOWPayments API:
   ```bash
   curl -X POST https://api.nowpayments.io/v1/recurring-payments \
     -H "x-api-key: $NOWPAYMENTS_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "HamaFX Pro Monthly",
       "price_amount": 15,
       "price_currency": "usd",
       "pay_currency": "usdt",
       "recurring_type": "month"
     }'
   ```
2. Copy the returned recurring payment ID.
3. Update the `plans` table:
   ```sql
   UPDATE plans SET nowpayments_plan_id = '<id>' WHERE name = 'Pro';
   ```

## Step 4 — Configure Payout Wallet

1. In NOWPayments dashboard → Settings → Payout Wallet:
   - Add your USDT (TRC-20) wallet address.
   - NOWPayments auto-settles to this wallet after each payment confirmation.
2. For Iraq payout:
   - Transfer USDT to Binance → P2P sell for IQD
   - OR transfer to Payoneer/Wise → withdraw to Iraqi bank

## Step 5 — Deploy and Test

1. Deploy to Vercel: `git push` (or merge PR to main).
2. Verify the webhook endpoint is reachable:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com/api/billing/webhook
   # Should return 200 (for GET) or 400 (for empty POST)
   ```
3. **End-to-end test** (acceptance criteria #6):
   - Log in as a test user.
   - Go to /settings/billing.
   - Click "Upgrade to Pro".
   - Pay the minimum crypto amount.
   - Verify the webhook fires (check `ipn_events` table).
   - Verify subscription status changes to `active`.
   - Verify Pro features are unlocked.
4. **Cancellation test** (acceptance criteria #4):
   - Cancel the subscription in NOWPayments dashboard.
   - Verify webhook fires with `refunded` or cancellation status.
   - Verify `subscription.status` changes to `canceled`.
5. **Idempotency test** (acceptance criteria #2):
   - Replay the same IPN webhook 3 times.
   - Verify no duplicate `payments` rows.
   - Verify subscription is not double-updated.

## Step 6 — Monitor

- Watch the `ipn_events` table for failed events (`processed = false`).
- Set up a Sentry alert for `billing-webhook` errors.
- Monitor `payments` table for unexpected statuses.
- Check NOWPayments dashboard for settlement confirmations.

## Rollback

If billing needs to be disabled:
1. Unset `NOWPAYMENTS_API_KEY` in Vercel (billing routes return 503).
2. Set all users to Free tier:
   ```sql
   UPDATE subscriptions SET status = 'canceled' WHERE status = 'active';
   ```
3. Feature gating falls back to Free tier defaults automatically.

---

## Open Questions (from plan §7 — resolve before going live)

1. **Pricing**: Confirm actual USD prices for Free/Pro/Enterprise.
2. **Trial period**: Decide if new signups get a free trial (e.g. 14 days Pro).
3. **Crypto options**: Confirm which cryptocurrencies to offer (recommend: USDT default, BTC/ETH optional).
4. **Tax/VAT**: Consult a tax advisor — NOWPayments does not act as merchant of record.
5. **Refund policy**: Write the policy text and display on the checkout page.
6. **Usage-based billing**: Decide if Pro has a monthly AI token cap or is unlimited.
7. **Payout cadence**: Decide how often to convert crypto → IQD via Binance P2P.
