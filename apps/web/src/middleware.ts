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
import { signUserId, USER_ID_HEADER, USER_ID_SIG_HEADER, getSigningSecret } from '@/lib/signed-user-header';

const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const requestId = readOrCreateRequestId(req);

  // ── Legacy Mode Fallback ──────────────────────────────────────────────
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

  // ── CSRF double-submit cookie ───────────────────────────────────────
  // P1-3: Always set the cookie on every request (including GET) so the
  // client always has a token before its first state-changing POST.
  // P2-6: Use __Host- prefix in production for stronger cookie binding.
  const csrfCookieName =
    process.env.NODE_ENV === 'production' ? '__Host-hfx_csrf' : 'hfx_csrf';
  let csrfToken = req.cookies.get(csrfCookieName)?.value;
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
  }

  const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  if (isStateChanging && req.nextUrl.pathname.startsWith('/api/') && !req.nextUrl.pathname.startsWith('/api/auth/')) {
    const headerToken = req.headers.get('x-csrf-token');
    if (!csrfToken || !headerToken || headerToken !== csrfToken) {
      return new NextResponse('Forbidden - CSRF token missing or invalid', { status: 403 });
    }
  }

  // ── Auth gate (handled by `authorized` callback in auth.config) ──────
  // `req.auth` is the JWT session (set by NextAuth's `auth()` wrapper).
  // The `authorized` callback has already redirected unauthed users on
  // protected routes, so by here `req.auth?.user` is either valid or
  // the request has been redirected to /login. We only need the userId
  // to inject as a header for downstream route handlers.
  const userId = req.auth?.user?.id ?? null;

  // ── SEC-1: Sign the x-user-id header for defense-in-depth ──────────
  // Route handlers verify the HMAC before trusting the fast-path
  // header. A spoofed header without a valid signature falls through
  // to the auth() slow path (JWT re-validation).
  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  // Strip any inbound spoofed signature header BEFORE we set our own.
  headers.delete(USER_ID_SIG_HEADER);
  if (userId) {
    headers.set(USER_ID_HEADER, userId);
  } else {
    // We deliberately do NOT inject the legacy '__system__' fallback
    // here. Route handlers that require auth check the header themselves
    // and return 401 if absent (see lib/api.ts::getUserIdFromRequest).
    // Hiding auth in a fake header would defeat the gate.
    headers.delete(USER_ID_HEADER);
  }

  const next = NextResponse.next({ request: { headers } });
  next.headers.set(REQUEST_ID_HEADER, requestId);
  if (userId) {
    next.headers.set(USER_ID_HEADER, userId);
    // Sign the userId + requestId pair so route handlers can verify
    // the header was set by middleware, not a malicious client.
    const secret = getSigningSecret();
    if (secret) {
      const sig = await signUserId(userId, requestId, secret);
      next.headers.set(USER_ID_SIG_HEADER, sig);
    }
    // If secret is missing: signature is absent; route handlers
    // will fall through to the auth() slow path. This is safe.
  }

  // P1-3 + P2-6: Always set the CSRF cookie on every response so the
  // client always has a fresh token. In production, use __Host- prefix
  // which requires Secure + Path=/ (automatically enforced by browsers).
  const isProd = process.env.NODE_ENV === 'production';
  next.cookies.set(csrfCookieName, csrfToken, {
    path: '/',
    sameSite: 'lax',
    secure: isProd,
    httpOnly: false, // double-submit pattern requires JS readability
  });
  return next;
});

export const config = {
  // Same exclusions as before — /api/auth is NextAuth's catch-all,
  // /api/cron is cron-secret-protected, /share is public, /auth is the
  // login surface. /api/billing/webhook is HMAC-signed (not session-auth).
  matcher: [
    '/((?!auth|share|api/auth|api/dev|api/cron|api/telegram|api/billing/webhook|debug|sw\\.js|sw-precache\\.json|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons|robots\\.txt|sitemap\\.xml).*)',
  ],
};
