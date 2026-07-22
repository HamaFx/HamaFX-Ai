// SPDX-License-Identifier: Apache-2.0

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

// ── C-3: CSP nonce helpers ──────────────────────────────────────────

/**
 * Set the Content-Security-Policy header on a NextResponse with a
 * per-request cryptographic nonce. The nonce enables script tags with
 * a matching nonce attribute to execute, while 'strict-dynamic'
 * propagates that trust to dynamically loaded scripts.
 */
function setCspHeader(response: NextResponse, nonce: string): void {
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'strict-dynamic' https://s3.tradingview.com https://d3js.org`,
      "style-src 'self' 'unsafe-inline' https://s3.tradingview.com",
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://s3.tradingview.com https://api.dicebear.com",
      "font-src 'self' data:",
      "connect-src 'self' wss: https://*.supabase.co https://*.biquote.io https://*.binance.com https://api.resend.com https://*.nowpayments.io https://*.tradingview.com https://api.dicebear.com",
    ].join('; '),
  );
}

// NB: explicit `any` annotation prevents a Next.js build error with
// NextAuth v5 where the inferred return type of auth() references an
// internal next-auth/lib/types path that tsc cannot resolve during
// the next build declaration phase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const middleware: any = auth(async (req) => {
  const requestId = readOrCreateRequestId(req);

  // ── C-3: Generate nonce early (used by both legacy and normal paths) ─
  const cspNonce = crypto.randomUUID().replace(/-/g, '');

  // ── Legacy Mode Fallback ──────────────────────────────────────────────
  // C-2: Legacy mode is ONLY allowed when NODE_ENV !== 'production'.
  // The ALLOW_LEGACY_AUTH escape hatch has been removed — legacy auth
  // in production is now a hard error in auth.config.ts at boot time.
  if (
    process.env.AUTH_MODE === 'legacy' &&
    process.env.NODE_ENV !== 'production'
  ) {
    const headers = new Headers(req.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set('x-user-id', '__system__');
    headers.set('x-csp-nonce', cspNonce);
    const next = NextResponse.next({ request: { headers } });
    next.headers.set(REQUEST_ID_HEADER, requestId);
    next.headers.set('x-user-id', '__system__');
    next.headers.set('x-csp-nonce', cspNonce);
    // Sign the x-user-id header so route handlers can verify the
    // HMAC fast-path (lib/api.ts::getUserIdFromRequest). Without
    // the signature, the fast path fails and the auth() slow path
    // returns null, causing 401 on all wrapped endpoints.
    const secret = getSigningSecret();
    if (secret) {
      const sig = await signUserId('__system__', requestId, secret);
      next.headers.set(USER_ID_SIG_HEADER, sig);
    }
    // Set CSP with nonce for legacy mode too
    setCspHeader(next, cspNonce);
    return next;
  }

  // ── CSRF double-submit cookie ───────────────────────────────────────
  // P1-3: Always set the cookie on every request (including GET) so the
  // client always has a token before its first state-changing POST.
  // P2-6 + M-4: Use __Host- prefix when cookies are secure.
  // The __Host- prefix requires Secure=true, Path=/, and no Domain attr.
  // We determine this from NODE_ENV=production OR COOKIE_SECURE_MODE=true
  // for Docker self-hosted deployments that serve over HTTPS.
  const useSecureCookie =
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE_MODE === 'true';
  const csrfCookieName = useSecureCookie ? '__Host-hfx_csrf' : 'hfx_csrf';
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
  // C-3: Pass CSP nonce to downstream request handlers.
  headers.set('x-csp-nonce', cspNonce);
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
  next.headers.set('x-csp-nonce', cspNonce);
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
  next.cookies.set(csrfCookieName, csrfToken, {
    path: '/',
    sameSite: 'strict',
    secure: useSecureCookie,
    httpOnly: false, // double-submit pattern requires JS readability
  });

  // C-3: Set CSP header with per-request nonce.
  setCspHeader(next, cspNonce);

  return next;
});

export default middleware;

export const config = {
  // Same exclusions as before — /api/auth is NextAuth's catch-all,
  // /api/cron is cron-secret-protected, /share is public, /auth is the
  // login surface. /api/billing/webhook is HMAC-signed (not session-auth).
  matcher: [
    '/((?!auth|share|api/auth|api/dev/login|api/cron|api/telegram|api/billing/webhook|debug|sw\\.js|sw-precache\\.json|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icons|robots\\.txt|sitemap\\.xml).*)',
  ],
};
