# Billing Webhook Safety Gate (Phase 5.8)

> **HARD GATE — not optional.** This document defines the requirements
> that MUST be met before paid plans can be enabled. The billing webhook
> (when Phase 8.3 lands) must ship with dead-letter handling + Sentry
> capture + paging on signature-verify/5xx failure **in the same PR**.
>
> Reference: `docs/review/07-observability-monitoring-review.md` §OBS-10

## Requirements

When the billing/payment integration is added (Phase 8.3), the following
MUST be implemented in the same PR that introduces the webhook:

### 1. Webhook Signature Verification

- Verify the webhook signature (HMAC or provider-specific) on every
  incoming request **before** any business logic runs.
- Reject unsigned or invalid-signature requests with HTTP 401.
- Capture signature-verification failures to Sentry with
  `tags: { component: 'billing-webhook', kind: 'signature-failure' }`.
- Page the on-call when signature failures exceed 3 in 5 minutes
  (possible webhook secret compromise or replay attack).

### 2. Dead-Letter Queue

- Failed webhook processing (after signature verification passes) must
  be stored in a dead-letter table or queue for manual replay:
  ```sql
  CREATE TABLE billing_webhook_dlq (
    id          text PRIMARY KEY DEFAULT gen_random_uuid(),
    provider    text NOT NULL,
    event_type  text NOT NULL,
    payload     jsonb NOT NULL,
    error       text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    replayed_at timestamptz,
    status      text NOT NULL DEFAULT 'pending'  -- pending | replayed | discarded
  );
  ```
- The webhook handler must catch all processing errors, insert the
  failed event into the DLQ, and return HTTP 200 (to prevent the
  provider from retrying indefinitely).
- A cron job should periodically alert on `pending` DLQ entries older
  than 1 hour.

### 3. Sentry Capture + Paging

- All webhook processing failures (5xx responses, unhandled exceptions)
  must be captured to Sentry with:
  ```typescript
  Sentry.captureException(err, {
    tags: { component: 'billing-webhook', provider, eventType },
    extra: { webhookId, eventId },
  });
  ```
- Configure a Sentry alert rule: `component:billing-webhook` events
  with level >= error → page on-call via Better Stack.
- The signature-verification failure alert (§1) should be a separate
  Sentry alert rule with a lower threshold (3 in 5 min).

### 4. Idempotency

- Webhook handlers must be idempotent: processing the same event twice
  must not double-charge or double-credit.
- Use a `billing_webhook_events` table to track processed event IDs:
  ```sql
  CREATE TABLE billing_webhook_events (
    id          text PRIMARY KEY,  -- provider's event ID
    provider    text NOT NULL,
    event_type  text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- On receipt, check if the event ID already exists. If so, return 200
  without reprocessing.

### 5. Acceptance Test

Before enabling paid plans:

- [ ] Send a webhook with an invalid signature → verify 401 + Sentry event
- [ ] Send a webhook that causes a processing error → verify DLQ entry + Sentry event
- [ ] Send the same webhook twice → verify idempotent (no double processing)
- [ ] Simulate 3 signature failures in 5 min → verify on-call is paged
- [ ] Verify the DLQ cron alert fires for entries >1 hour old

**Paid plans MUST NOT be enabled until all acceptance tests pass.**
