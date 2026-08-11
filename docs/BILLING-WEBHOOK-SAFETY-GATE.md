# Billing Webhook Safety Gate (Phase 5.8)

> **HARD GATE — not optional.** This document records the operational
> requirements that must be met before paid plans are enabled. The live
> implementation is the source of truth; this document must not describe
> controls that are absent from code or operator configuration.

## Requirements

The live billing/payment integration must satisfy the following controls:

### 1. Webhook Signature Verification

- Verify the webhook signature (HMAC or provider-specific) on every
  incoming request **before** any business logic runs.
- Reject unsigned or invalid-signature requests with HTTP 401.
- Capture signature-verification failures to Sentry with
  `tags: { component: 'billing-webhook', kind: 'signature-failure' }`.
- Emit the `billing_webhook_signature_failure` Sentry count metric for every
  invalid signature. Configure a Sentry metric alert for at least 3 events
  in 5 minutes and route that alert to the operator's paging system.

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
- Configure a Sentry alert rule for `component:billing-webhook` errors
  and route it to the operator's paging system.
- Configure a separate Sentry metric alert for
  `billing_webhook_signature_failure` at 3 events in 5 minutes.
- These Sentry rules are operator configuration, not represented in this
  repository; paid plans remain disabled until they are verified in the
  active Sentry project.

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
- [ ] Simulate 3 signature failures in 5 min → verify the Sentry metric alert and paging integration
- [ ] Verify the DLQ cron alert fires for entries >1 hour old

**Paid plans MUST NOT be enabled until all acceptance tests pass.**
