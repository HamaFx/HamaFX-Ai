// SPDX-License-Identifier: Apache-2.0

import { describe, it } from 'vitest';

// Billing test contract — Phase 0.10.
//
// No payment/subscription code exists yet. This file defines the
// acceptance criteria the billing implementation must satisfy when it
// lands (Phase 8.3). Each `it.todo` below is a placeholder that will
// become a real test once the corresponding module is implemented.
//
// This is the only intentional use of `.todo` in the repo; it exists so
// billing ships test-first rather than retrofitting tests after the fact.

describe('billing contract — Phase 0.10', () => {
  describe('auth/tenant scoping', () => {
    it.todo('getSubscription(tenantId) returns only rows for the given tenant');
    it.todo('writes are rejected when the tenant_id does not match the authenticated tenant');
    it.todo('listInvoices(tenantId) never returns invoices belonging to another tenant');
  });

  describe('idempotency', () => {
    it.todo('createCheckoutSession(idempotencyKey) returns the same session URL on retry');
    it.todo('retrying with the same idempotency key does not create duplicate subscriptions');
    it.todo('retrying with the same idempotency key does not create duplicate invoices');
  });

  describe('webhook signature verification', () => {
    it.todo('verifyWebhookSignature(payload, signature, secret) rejects missing signatures');
    it.todo('verifyWebhookSignature rejects invalid signatures with HTTP 400');
    it.todo('signature comparison is constant-time');
    it.todo('payload is never parsed before signature verification succeeds');
  });

  describe('proration / plan changes', () => {
    it.todo('changePlan(tenantId, newPlanId, prorate) creates a prorated invoice on upgrade');
    it.todo('changePlan applies a prorated credit on downgrade');
    it.todo('subscription record and invoice are updated atomically');
  });

  describe('dunning / payment failures', () => {
    it.todo('handlePaymentFailure(subscriptionId, attempt) enters a grace period');
    it.todo('retries are scheduled with exponential backoff');
    it.todo('access is revoked only after the configured retry limit');
  });
});
