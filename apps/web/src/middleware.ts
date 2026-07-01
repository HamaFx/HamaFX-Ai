/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Edge middleware — runs on every matched request.
//
// Uses NextAuth v5's Edge-safe auth() wrapper. The full config (with the
// DrizzleAdapter and Credentials provider) lives in `auth.ts` (Node only);
// the middleware only needs the JWT verifier and the `authorized` callback
// from `auth.config.ts`, so the Edge bundle stays slim.
//
// What this does, in order:
//   1. Mint/refresh the CSRF double-submit cookie.
//   2. Enforce CSRF on state-changing /api/* requests.
//   3. NextAuth validates the session cookie and populates `req.auth`.
//      The `authorized` callback in auth.config.ts handles the redirect
//      to /login for unauthenticated requests on protected routes.
//   4. Stamp the request id downstream (visible to route handlers).
//   5. Inject `x-user-id` from the JWT for downstream handlers that read
//      it via `getUserIdFromRequest()` (lib/api.ts) instead of re-decoding
//      the JWT themselves.

import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';

import { authConfig } from './auth.config';
import { REQUEST_ID_HEADER, readOrCreateRequestId } from '@/lib/request-id';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const requestId = readOrCreateRequestId(req);

  // ── Legacy Mode Fallback ─────────────────────────────────────────
  // MED-05: Only allow legacy mode in development
  if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV !== 'production') {
    const headers = new Headers(req.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set('x-user-id', '__system__');
    const next = NextResponse.next({ request: { headers } });
    next.headers.set(REQUEST_ID_HEADER, requestId);
    next.headers.set('x-user-id', '__system__');
    return next;
  }

  // ── CSRF double-submit cookie (state-changing /api/*) ───────────
  const cookieToken = req.cookies.get('hfx_csrf')?.value;
  let csrfToken = cookieToken;
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
  }
  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  if (isStateChanging && req.nextUrl.pathname.startsWith('/api/') && !req.nextUrl.pathname.startsWith('/api/auth/')) {
    // MED-02: Always require CSRF token for state-changing API requests
    const headerToken = req.headers.get('x-csrf-token');
    if (!cookieToken || !headerToken || headerToken !== cookieToken) {
      return new NextResponse('Forbidden - CSRF token missing or invalid', { status: 403 });
    }
  }

  // ── Auth gate (handled by `authorized` callback in auth.config) ──
  // `req.auth` is the JWT session (set by NextAuth's `auth()` wrapper).
  // The `authorized` callback has already redirected unauthed users on
  // protected routes, so by here `req.auth?.user` is either valid or
  // the request has been redirected to /login. We only need the userId
  // to inject as a header for downstream route handlers.
  const userId = req.auth?.user?.id ?? null;

  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  if (userId) {
    headers.set('x-user-id', userId);
  } else {
    // We deliberately do NOT inject the legacy '__system__' fallback
    // here. Route handlers that require auth check the header themselves
    // and return 401 if absent (see lib/api.ts::getUserIdFromRequest).
    // Hiding auth in a fake header would defeat the gate.
    headers.delete('x-user-id');
  }

  const next = NextResponse.next({ request: { headers } });
  next.headers.set(REQUEST_ID_HEADER, requestId);
  if (userId) {
    next.headers.set('x-user-id', userId);
  }

  // Preserve the incoming CSRF cookie on the response so the client keeps
  // the same double-submit token across requests.
  if (cookieToken) {
    next.cookies.set('hfx_csrf', cookieToken, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  } else {
    next.cookies.set('hfx_csrf', csrfToken, {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return next;
});

export const config = {
  // Same exclusions as before — /api/auth is NextAuth's catch-all,
  // /api/cron is cron-secret-protected, /share is public, /auth is the
  // login surface.
  matcher: [
    '/((?!auth|share|api/auth|api/dev|api/cron|api/telegram|debug|sw\\.js|sw-precache\\.json|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons|robots\\.txt|sitemap\\.xml).*)',
  ],
};
