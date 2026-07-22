// SPDX-License-Identifier: Apache-2.0

// POST /api/admin/test-alert-email
//
// Sends a single, clearly-labelled test email through Resend so the single
// user can confirm the alerts pipeline is wired correctly end-to-end. The
// route is gated by the password cookie middleware; this handler also
// performs an explicit defense-in-depth session recheck.
//
// Responses:
//   200 { id }                   on Resend 2xx
//   401 { error: 'unauthorized' } when the session cookie is missing/invalid
//   503 { missing: string[] }    when one or more required env vars are unset
//                                 (variable NAMES only, never values)
//   502 { error: string }        on Resend non-2xx (response text truncated)


import { AppError } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({ to: z.string().email().optional() });

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SUBJECT = '[HamaFX-Ai] Test alert email';
const TEXT_BODY = 'If you received this, the alerts pipeline is wired up correctly.\n\n— HamaFX-Ai';

interface ResendCreateResponse {
  id?: string;
}

export const POST = withAuth<void>(async (req) => {
  // 2. Parse body — accept empty body as `{}` so a no-arg POST works.
  const raw = await safeReadJson(req);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(new AppError('VALIDATION', 'Invalid request body', 400, { issues: parsed.error.issues }), req);
  }
  const body = parsed.data;

  // 3. Env contract. Read directly from process.env so a missing var produces
  //    a 503 with the variable NAME (never the value), even when other
  //    unrelated server envs may not be set.
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
  const ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? '';
  const ALERT_TO_EMAIL = process.env.ALERT_TO_EMAIL ?? '';

  const missing: string[] = [];
  if (!RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!ALERT_FROM_EMAIL) missing.push('ALERT_FROM_EMAIL');
  if (!ALERT_TO_EMAIL && !body.to) missing.push('ALERT_TO_EMAIL');
  if (missing.length > 0) {
    return Response.json({ missing }, { status: 503 });
  }

  // 4. Send via Resend.
  const recipient = body.to ?? ALERT_TO_EMAIL;
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

/** `req.json()` that tolerates empty bodies and invalid JSON by returning `{}`. */
async function safeReadJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}
