// SPDX-License-Identifier: Apache-2.0

// POST /api/admin/test-alert-email
//
// Sends a single, clearly-labelled test email through Resend so the
// operator can confirm the alerts pipeline is wired correctly end-to-end.
//
// Security:
//   - Requires admin authentication (withAdminAuth).
//   - The caller-controlled `to` override is ignored unless the operator
//     explicitly sets ALERT_TEST_ALLOW_OVERRIDE=true. When overrides are
//     enabled, an optional ALERT_TEST_RECIPIENT_ALLOWLIST restricts the
//     permitted addresses (comma-separated, case-insensitive). This
//     prevents the route from becoming an open relay for arbitrary email.
//   - Rate-limited to 5 requests per minute per admin.
//
// Responses:
//   200 { id }                         on Resend 2xx
//   400 { error: { code, message } }   on validation / allowlist failure
//   401 { error: { code, message } }   when the session cookie is missing/invalid
//   403 { error: { code, message } }   when the authenticated user is not an admin
//   429 { error: { code, message } }   when the per-admin rate limit is exceeded
//   503 { missing: string[] }          when one or more required env vars are unset
//                                      (variable NAMES only, never values)
//   502 { error: string }              on Resend non-2xx (response text truncated)

import { AppError } from '@hamafx/shared';
import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { errorResponse, parseJsonBody } from '@/lib/api';
import { checkAdminRateLimit } from '@/lib/admin-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  /** Optional recipient override; only honoured when override mode is enabled. */
  to: z.string().email().optional(),
}).default({});

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SUBJECT = '[HamaFX-Ai] Test alert email';
const TEXT_BODY = 'If you received this, the alerts pipeline is wired up correctly.\n\n— HamaFX-Ai';

interface ResendCreateResponse {
  id?: string;
}

export const POST = withAdminAuth(async (req, { user }) => {
  const body = await parseJsonBody(req, BodySchema);

  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
  const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? '';
  const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL ?? '';

  const override = deriveAlertRecipient(body.to);
  if (!override.ok) {
    return errorResponse(new AppError('VALIDATION', override.error, 400), req);
  }

  const recipient = override.recipient ?? ALERT_TO_EMAIL;

  const rateLimit = checkAdminRateLimit(user.userId);
  if (!rateLimit.allowed) {
    const headers: Record<string, string> = {};
    if (rateLimit.retryAfter !== undefined) {
      headers['Retry-After'] = String(rateLimit.retryAfter);
    }
    return Response.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' } },
      { status: 429, headers },
    );
  }

  const missing: string[] = [];
  if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!ALERT_FROM_EMAIL) missing.push('ALERT_FROM_EMAIL');
  if (!recipient) missing.push('ALERT_TO_EMAIL');
  if (missing.length > 0) {
    return Response.json({ missing }, { status: 503 });
  }

  const resendResponse = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: ALERT_FROM_EMAIL,
      to: [recipient],
      subject: SUBJECT,
      text: TEXT_BODY,
    }),
  });

  if (!resendResponse.ok) {
    const text = await resendResponse.text().catch(() => '');
    return Response.json(
      { error: `resend HTTP ${resendResponse.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const json = (await resendResponse.json().catch(() => ({}))) as ResendCreateResponse;
  return Response.json({ id: json.id ?? null }, { status: 200 });
});

interface RecipientResult {
  ok: true;
  recipient?: string;
}

interface RecipientError {
  ok: false;
  error: string;
}

function deriveAlertRecipient(bodyTo: string | undefined): RecipientResult | RecipientError {
  const allowOverride = process.env.ALERT_TEST_ALLOW_OVERRIDE === 'true';
  if (!allowOverride || !bodyTo) {
    return { ok: true };
  }

  const allowlistRaw = process.env.ALERT_TEST_RECIPIENT_ALLOWLIST;
  if (!allowlistRaw) {
    // Override is enabled but no allowlist is configured; ignore the override
    // and fall back to the configured recipient.
    return { ok: true };
  }

  const allowlist = allowlistRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.includes(bodyTo.toLowerCase())) {
    return {
      ok: false,
      error: 'Recipient not in ALERT_TEST_RECIPIENT_ALLOWLIST',
    };
  }

  return { ok: true, recipient: bodyTo };
}
