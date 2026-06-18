// NextAuth v5 Edge-compatible configuration.
// Imported by middleware.ts (Edge runtime) — must NOT import Node.js modules.
// Full configuration (providers, adapter) lives in auth.ts (Node runtime).

import type { NextAuthConfig } from 'next-auth';

const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

export const authConfig: NextAuthConfig = {
  // NextAuth v5 requires an explicit secret for JWT signing. Without
  // this, every /api/auth/* call throws MissingSecret. We set it
  // unconditionally here — the value may be `undefined` if neither
  // env var is set, in which case NextAuth falls back to reading
  // AUTH_SECRET itself.
  ...(nextAuthSecret ? { secret: nextAuthSecret } : {}),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAuth =
        nextUrl.pathname === '/login' || nextUrl.pathname === '/register';

      // Auth surface (login + register) is always reachable.
      if (isOnAuth) return true;

      // Logged-in user is allowed through; the `authorized` callback is
      // also responsible for the redirect when `isLoggedIn` is false.
      if (isLoggedIn) return true;

      // Unauthenticated on a protected route → redirect to /login with
      // the original URL preserved as `?next=`.
      const redirectUrl = new URL('/login', nextUrl.origin);
      redirectUrl.searchParams.set('next', nextUrl.pathname + nextUrl.search);
      return Response.redirect(redirectUrl);
    },
    jwt({ token, user }) {
      // On first sign-in, copy the DB user id into the JWT. Subsequent
      // requests read it from the JWT directly (no DB roundtrip needed
      // for the middleware auth gate).
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