// Edge middleware — runs on every matched request. Personal-mode auth gate:
// presence of a valid `hfx_auth` cookie. Anything that needs to be reachable
// without auth (login, auth API, cron) is excluded by `config.matcher` below.
//
// Phase 7a: every request is stamped with `X-Request-Id`. Inbound id from
// the client (curl, upstream proxy) is honoured if present; otherwise we
// mint a fresh UUID. Both the request that the route handler sees AND the
// outbound response carry the header so logs and UI bug reports correlate.

import { NextResponse, type NextRequest } from 'next/server';

import { AUTH_COOKIE_NAME, verifyAuthToken } from '@/lib/auth';
import { getAuthEnv } from '@/lib/env';
import { readOrCreateRequestId, REQUEST_ID_HEADER } from '@/lib/request-id';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const env = getAuthEnv();
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET);
  const requestId = readOrCreateRequestId(req);

  if (!payload) {
    const url = req.nextUrl.clone();
    const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    url.pathname = '/login';
    url.search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
    const redirect = NextResponse.redirect(url);
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  // Phase 3 hardening §22 — CSRF double-submit cookie pattern.
  let csrfToken = req.cookies.get('hfx_csrf')?.value;
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
  }

  // Enforce CSRF on state-changing endpoints under /api/*
  // (Note: /api/cron/* is exempted by config.matcher).
  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  if (isStateChanging && req.nextUrl.pathname.startsWith('/api/')) {
    const headerToken = req.headers.get('x-csrf-token');
    if (!headerToken || headerToken !== csrfToken) {
      return new NextResponse('Forbidden - CSRF token missing or invalid', { status: 403 });
    }
  }

  // Forward the id downstream so route handlers can read it from
  // `req.headers.get('x-request-id')`.
  const next = NextResponse.next({
    request: {
      headers: (() => {
        const h = new Headers(req.headers);
        h.set(REQUEST_ID_HEADER, requestId);
        return h;
      })(),
    },
  });
  next.headers.set(REQUEST_ID_HEADER, requestId);
  
  // Set the CSRF cookie on the response if we minted a new one.
  if (!req.cookies.has('hfx_csrf')) {
    next.cookies.set('hfx_csrf', csrfToken, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return next;
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
    '/((?!login|share|api/auth|api/cron|api/telegram|sw\\.js|sw-precache\\.json|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons|robots\\.txt|sitemap\\.xml).*)',
  ],
};
