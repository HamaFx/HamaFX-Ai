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

// NextAuth v5 — full configuration (Node.js runtime only).
//
// The Edge-compatible `authConfig` (imported from `./auth.config`) carries
// session strategy, callbacks, and the page paths. This file layers on
// the database adapter and providers, so the Edge bundle stays slim.
//
// Splitting like this is the canonical NextAuth v5 pattern: see
// https://authjs.dev/guides/edge-compatibility — the middleware uses the
// bare `authConfig` via `NextAuth(authConfig).auth`, while route handlers
// and server actions use the full config exported here.

import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { getDb, schema } from '@hamafx/db';

// `NextAuth()` returns a value whose inferred type carries deep paths into
// `@auth/core/providers`. That inferred type isn't portable across pnpm
// store layouts (TS error TS2742). We side-step the portability error by
// typing the destructured exports with the structural shape we need,
// rather than re-naming the inferred type. The @ts-ignore on the right-hand
// side suppresses the only error TS reports; consumers re-narrow as needed.
// See: https://github.com/nextauthjs/next-auth/discussions/9138
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _nextAuth = NextAuth as any;

const IMPERSONATION_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.ENABLE_IMPERSONATION === 'true';

export const { handlers, auth, signIn, signOut } = _nextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials, _req) {
        try {
          const email =
            typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
          const password =
            typeof credentials?.password === 'string' ? credentials.password : '';
          if (!email || !password) return null;

          const db = getDb();
          const [user] = await db
            .select()
            .from(schema.users)
            .where(and(
              eq(schema.users.email, email),
              isNull(schema.users.deletedAt),
            ))
            .limit(1);

          if (!user || !user.hashedPassword) return null;

          if (user.lockedUntil && user.lockedUntil > new Date()) {
            throw new Error('ACCOUNT_LOCKED');
          }

          const passwordValid = await bcrypt.compare(password, user.hashedPassword);

          if (!passwordValid) {
            const attempts = (user.failedLoginAttempts ?? 0) + 1;
            const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
            try {
              await db.update(schema.users)
                .set({ failedLoginAttempts: attempts, lockedUntil: lockUntil })
                .where(eq(schema.users.id, user.id));
            } catch { /* fail open */ }
            return null;
          }

          // Reset lockout counter on successful password
          try {
            await db.update(schema.users)
              .set({ failedLoginAttempts: 0, lockedUntil: null })
              .where(eq(schema.users.id, user.id));
          } catch { /* fail open */ }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            tokenVersion: user.tokenVersion,
            sessionId: '',
            rememberMe: false,
          };
        } catch (error) {
          console.error('[auth] authorize error:', error);
          return null;
        }
      },
    }),
    // Dev-only impersonation provider. Only registered when ENABLE_IMPERSONATION
    // is set and not in production. This provider bypasses password checks
    // so an admin can sign in as another user for debugging.
    ...(IMPERSONATION_ENABLED
      ? [
          Credentials({
            id: 'impersonate',
            name: 'Impersonation',
            credentials: {
              userId: { label: 'User ID', type: 'text' },
            },
            async authorize(credentials) {
              const userId = typeof credentials?.userId === 'string' ? credentials.userId : '';
              if (!userId) return null;

              const db = getDb();
              const [user] = await db
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .limit(1);

              if (!user) return null;

              return {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
                tokenVersion: user.tokenVersion,
                sessionId: '',
                rememberMe: false,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id;
        token.tokenVersion = user.tokenVersion ?? 0;
        if (user.sessionId) {
          token.sessionId = user.sessionId;
        }
        // FEAT-04: Store rememberMe in JWT
        if (user.rememberMe === true) {
          token.rememberMe = true;
        }
      }
      if (token.tokenVersion === undefined) {
        token.tokenVersion = 0;
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: { session: any; token: any }) {
      if (session.user && token.id) {
        session.user.id = token.id;
      }
      if (token.sessionId) {
        session.sessionId = token.sessionId;
      }
      const now = Math.floor(Date.now() / 1000);

      // FEAT-04: Without rememberMe, invalidate sessions older than 24h
      if (token.iat && token.rememberMe !== true && now - token.iat as number > 86400) {
        return { ...session, user: undefined, expires: '0' };
      }
      const lastChecked = token.tvCheckedAt as number | undefined;
      if (!lastChecked || now - lastChecked > 300) {
        try {
          const db = getDb();
          const [u] = await db
            .select({ tv: schema.users.tokenVersion })
            .from(schema.users)
            .where(eq(schema.users.id, token.id))
            .limit(1);
          if (u && u.tv !== token.tokenVersion) {
            return { ...session, user: undefined, expires: '0' };
          }
          token.tvCheckedAt = now;
        } catch {
          // DB error — fail open
        }
      }
      // FEAT-02: Track last active time every 15 min
      const lastActiveUpdate = token.lastActiveUpdate as number | undefined;
      const sessionId = token.sessionId as string | undefined;
      if (sessionId && (!lastActiveUpdate || now - lastActiveUpdate > 900)) {
        try {
          const db = getDb();
          await db
            .update(schema.userSessions)
            .set({ lastActiveAt: new Date() })
            .where(eq(schema.userSessions.id, sessionId));
          token.lastActiveUpdate = now;
        } catch {
          // fail open
        }
      }
      return session;
    },
  },
});

