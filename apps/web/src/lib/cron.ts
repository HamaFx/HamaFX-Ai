// Helpers for Vercel-Cron-triggered route handlers.
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` on every cron invocation
// when `crons` is configured in vercel.json and `CRON_SECRET` is set in env.

import { authError } from '@hamafx/shared';

import { timingSafeEqual } from './auth';
import { getAuthEnv } from './env';

/**
 * Assert that the request carries the expected cron bearer token.
 * Throws AppError(401) on mismatch — let your route handler catch and 401.
 */
export function assertCronAuth(req: Request): void {
  const env = getAuthEnv();
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (!timingSafeEqual(header, expected)) {
    throw authError('Invalid cron secret');
  }
}

/**
 * Tiny wrapper for cron handler bodies — handles auth + JSON response shape
 * + uniform error envelope. Phase-0 stubs return `processed: 0`.
 */
export async function withCronAuth(
  req: Request,
  fn: () => Promise<{ processed: number; note?: string }>,
): Promise<Response> {
  try {
    assertCronAuth(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return Response.json({ error: { code: 'AUTH', message } }, { status: 401 });
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
