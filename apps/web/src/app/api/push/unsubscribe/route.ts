// POST /api/push/unsubscribe
//
// Deletes a browser-issued PushSubscription by its `endpoint`. Always
// responds 200, even when the row was already gone — unsubscribing should
// be idempotent from the caller's perspective.
//
// Gated by the password cookie middleware.

import { deletePushSubscriptionByEndpoint } from '@hamafx/ai';
import { z } from 'zod';

import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/auth';
import { getAuthEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
  const env = getAuthEnv();
  const session = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
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

  await deletePushSubscriptionByEndpoint(parsed.data.endpoint);
  return Response.json({ ok: true }, { status: 200 });
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
