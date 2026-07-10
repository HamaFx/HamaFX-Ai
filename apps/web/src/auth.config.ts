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
  // unconditionally here — the value may be `undefined` if neither
  // env var is set, in which case NextAuth falls back to reading
  // AUTH_SECRET itself.
  secret: nextAuthSecret,
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }, // 30 days (FEAT-04: remember me)
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // MED-05: Only allow legacy mode in development
      if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV !== 'production') return true;

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