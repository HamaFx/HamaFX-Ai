// Helpers for Vercel-Cron-triggered route handlers.
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` on every cron invocation
// when `crons` is configured in vercel.json and `CRON_SECRET` is set in env.
//
// Phase 4 addition: session-cookie bypass so the admin UI can trigger crons
// via fetch() without exposing CRON_SECRET to the client.

import { authError } from '@hamafx/shared';

import { AUTH_COOKIE_NAME, verifyAuthToken, timingSafeEqual } from './auth';
import { getAuthEnv } from './env';

/**
 * Assert that the request carries either:
 *   1. The expected cron bearer token (schedulers), OR
 *   2. A valid session cookie (admin UI refresh buttons).
 * Throws AppError(401) on mismatch.
 */
export function assertCronAuth(req: Request): void {
  const env = getAuthEnv();

  // Path 1: Bearer token (cron schedulers — GitHub Actions, Vercel Cron)
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (header.length > 0 && timingSafeEqual(header, expected)) {
    return; // authorized via bearer
  }

  // Path 2: Session cookie (admin UI — user is already logged in)
  const cookieHeader = req.headers.get('cookie') ?? '';
  const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
  if (token) {
    // We can't await here (sync function), so we defer to the async wrapper.
    // This path is handled in `withCronAuth` below instead.
    throw authError('Invalid cron secret');
  }

  throw authError('Invalid cron secret');
}

/**
 * Tiny wrapper for cron handler bodies — handles auth + JSON response shape
 * + uniform error envelope. Supports both Bearer token and session cookie.
 */
export async function withCronAuth(
  req: Request,
  fn: () => Promise<{ processed: number; note?: string }>,
): Promise<Response> {
  const env = getAuthEnv();

  // Path 1: Bearer token
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  const hasBearerAuth = header.length > 0 && timingSafeEqual(header, expected);

  // Path 2: Session cookie (admin UI refresh buttons)
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
    console.error('[cron] handler error', err);
    return Response.json(
      { error: { code: 'INTERNAL', message: 'Cron handler failed' } },
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
