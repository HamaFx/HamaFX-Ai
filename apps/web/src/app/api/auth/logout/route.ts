// POST /api/auth/logout — clears the auth cookie. No body, idempotent.

import { clearedCookieSerialized } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const isProd = process.env.NODE_ENV === 'production';
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearedCookieSerialized(isProd),
    },
  });
}
