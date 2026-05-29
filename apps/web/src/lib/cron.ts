// Helpers for Vercel-Cron-triggered route handlers.
//
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` on every cron
// invocation when `crons` is configured in vercel.json and
// `CRON_SECRET` is set in env. The same secret is used by the GCE-VM
// systemd timers that hit the light cron URLs.
//
// `withCronAuth` is the sole entry point. It accepts two flavours of
// credential:
//
//   1. **Bearer token** (schedulers) — `Authorization: Bearer <secret>`.
//      Stable across deploys; rotate with the rest of the env block.
//   2. **Session cookie** (admin UI refresh buttons) — the same
//      password-cookie that gates the rest of the app. Lets the
//      operator hand-trigger a cron from the dashboard without
//      pasting `CRON_SECRET` into the client.
//
// Phase 3 hardening §15 — the synchronous `assertCronAuth` helper that
// used to live alongside `withCronAuth` was removed. It only ever
// covered path 1 (sync verification), so callers always had to fall
// back to the async path anyway. One canonical entry point keeps the
// auth contract obvious.

import { verifyAuthToken, timingSafeEqual, AUTH_COOKIE_NAME } from './auth';
import { getAuthEnv } from './env';

/**
 * Tiny wrapper for cron handler bodies — handles auth + JSON response
 * shape + uniform error envelope. Accepts the bearer token (the
 * cron-scheduler path) or a valid session cookie (the admin-UI path).
 *
 * Returns 401 when neither credential is present or valid; 500 when
 * the handler body throws (with the error message in the response so
 * cron logs are useful for debugging).
 */
export async function withCronAuth(
  req: Request,
  fn: () => Promise<{ processed: number; note?: string }>,
): Promise<Response> {
  const env = getAuthEnv();

  // Path 1: Bearer token (cron schedulers).
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  const hasBearerAuth = header.length > 0 && timingSafeEqual(header, expected);

  // Path 2: Session cookie (admin UI refresh buttons).
  let hasSessionAuth = false;
  if (!hasBearerAuth) {
    const cookieHeader = req.headers.get('cookie') ?? '';
    const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
    if (token) {
      const payload = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET);
      hasSessionAuth = payload !== null;
    }
  }

  if (!hasBearerAuth && !hasSessionAuth) {
    return Response.json({ error: { code: 'AUTH', message: 'Unauthorized' } }, { status: 401 });
  }

  try {
    const result = await fn();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron handler failed';
    console.error('[cron] handler error', err);
    return Response.json(
      { error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
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
