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

// NextAuth v5 Edge-compatible configuration.
// Imported by middleware.ts (Edge runtime) — must NOT import Node.js modules.
// Full configuration (providers, adapter) lives in auth.ts (Node runtime).

import type { NextAuthConfig } from 'next-auth';

// P2-3: Prod boot invariant — AUTH_SECRET is mandatory in production.
// The dev fallback must never be used in prod because it ships in the
// public repo and would allow JWT forgery.
if (
  process.env.NODE_ENV === 'production' &&
  !process.env.AUTH_SECRET &&
  !process.env.NEXTAUTH_SECRET
) {
  throw new Error(
    '[SECURITY] AUTH_SECRET (or NEXTAUTH_SECRET) must be set in production. ' +
      'Generate: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"',
  );
}

// C-2: Hard-block AUTH_MODE=legacy in production. Legacy auth mode
// bypasses all authentication — it must NEVER be active when
// NODE_ENV=production. Previously ALLOW_LEGACY_AUTH provided an
// escape hatch; that has been removed as a security risk.
if (
  process.env.AUTH_MODE === 'legacy' &&
  process.env.NODE_ENV === 'production'
) {
  throw new Error(
    '[SECURITY] AUTH_MODE=legacy is forbidden in production. ' +
      'Legacy auth mode bypasses all authentication and must only be used in development. ' +
      'Unset AUTH_MODE or set it to "normal" for production deployments.',
  );
}

// Dev fallback: ensures the Edge middleware never runs without a
// signing secret (which would cause MissingSecret errors and break
// the auth gate). In production AUTH_SECRET must be set explicitly.
const nextAuthSecret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV !== 'production'
    ? 'dev-fallback-secret-must-be-at-least-32-chars-long!!'
    : undefined);

export const authConfig: NextAuthConfig = {
  // NextAuth v5 requires an explicit secret for JWT signing. Without
  // this, every /api/auth/* call throws MissingSecret. We set it
  // here when available — if neither env var is set, the property is
  // omitted entirely and NextAuth falls back to reading AUTH_SECRET
  // itself. (Conditionally spread because `exactOptionalPropertyTypes`
  // forbids assigning `undefined` to `secret: string | string[]`.)
  ...(nextAuthSecret ? { secret: nextAuthSecret } : {}),
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 days (FEAT-04: remember me)
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // C-2: Legacy mode is ONLY allowed when NODE_ENV !== 'production'.
      // The ALLOW_LEGACY_AUTH escape hatch has been removed — legacy auth
      // in production is now a hard error at module load time (see above).
      if (
        process.env.AUTH_MODE === 'legacy' &&
        process.env.NODE_ENV !== 'production'
      ) return true;

      const isLoggedIn = !!auth?.user;
      const isOnAuth =
        nextUrl.pathname === '/login' || nextUrl.pathname === '/register' ||
        nextUrl.pathname === '/forgot-password' || nextUrl.pathname === '/reset-password';

      // Auth surface (login + register) is always reachable.
      if (isOnAuth) return true;

      // Logged-in user is allowed through; the `authorized` callback is
      // also responsible for the redirect when `isLoggedIn` is false.
      if (isLoggedIn) return true;

      // MED-01: Prevent open redirect via protocol-relative URLs
      const next = nextUrl.pathname + nextUrl.search;
      const redirectUrl = new URL('/login', nextUrl.origin);
      if (next.startsWith('/') && !next.startsWith('//')) {
        redirectUrl.searchParams.set('next', next);
      }
      return Response.redirect(redirectUrl);
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  providers: [], // configured in auth.ts (Node runtime)
};