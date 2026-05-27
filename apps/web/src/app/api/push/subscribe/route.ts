// POST /api/push/subscribe
//
// Persists a browser-issued PushSubscription. Idempotent on `endpoint`
// (re-subscribing from the same browser overwrites `p256dh`/`auth`).
//
// Gated by the password cookie middleware. Returns:
//   200 { id }                       on success
//   400 { error: 'invalid_body' }    on schema parse failure
//   401 { error: 'unauthorized' }    when the session cookie is missing/invalid
//   503 { missing: string[] }        when VAPID keys are not configured

import { savePushSubscription } from '@hamafx/ai';
import { z } from 'zod';

import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/auth';
import { getAuthEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: Request): Promise<Response> {
  // Defense-in-depth recheck (middleware already gates this).
  const cookieHeader = req.headers.get('cookie') ?? '';
  const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
  const env = getAuthEnv();
  const session = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const missing: string[] = [];
  if (!process.env.VAPID_PUBLIC_KEY) missing.push('VAPID_PUBLIC_KEY');
  if (!process.env.VAPID_PRIVATE_KEY) missing.push('VAPID_PRIVATE_KEY');
  if (missing.length > 0) {
    return Response.json({ missing }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent') ?? null;
  const row = await savePushSubscription({
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent,
  });

  return Response.json({ id: row.id }, { status: 200 });
}

function readCookie(header: string, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
