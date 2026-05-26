// Edge middleware — runs on every matched request. Personal-mode auth gate:
// presence of a valid `hfx_auth` cookie. Anything that needs to be reachable
// without auth (login, auth API, cron) is excluded by `config.matcher` below.

import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/auth';
import { getAuthEnv } from '@/lib/env';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const env = getAuthEnv();
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET);

  if (!payload) {
    const url = req.nextUrl.clone();
    const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    url.pathname = '/login';
    url.search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Run middleware on everything EXCEPT:
   *   - /login                         (the login surface itself)
   *   - /api/auth/*                    (login + logout endpoints)
   *   - /api/cron/*                    (cron-secret-protected internally)
   *   - Static files / Next internals  (_next, favicon, icons, manifest, robots)
   *
   * Anything matched here requires a valid auth cookie.
   */
  matcher: [
    '/((?!login|api/auth|api/cron|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons|robots\\.txt|sitemap\\.xml).*)',
  ],
};
