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

import { decryptSecret } from '@hamafx/shared/encryption';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
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

const adapter = DrizzleAdapter(getDb());

export const { handlers, auth, signIn, signOut } = _nextAuth({
  ...authConfig,
  adapter,
  providers: [
    Credentials({
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials, req) {
        const email =
          typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        // FEAT-02: Capture IP and User-Agent from request headers
        let reqIp: string | null = null;
        let reqUserAgent: string | null = null;
        if (req && typeof req === 'object' && 'headers' in req) {
          const h = req.headers as { get?: (k: string) => string | null } | undefined;
          if (h && typeof h.get === 'function') {
            const fwd = h.get('x-forwarded-for');
            const rip = h.get('x-real-ip');
            const ua = h.get('user-agent');
            const rawIp = fwd || rip || '';
            reqIp = rawIp ? rawIp.split(',')[0]!.trim() : null;
            reqUserAgent = ua || null;
          }
        }

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

        // LOW-05: Check account lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          // FEAT-03: Audit log for locked account attempt
          try {
            await db.insert(schema.auditLogs).values({
              userId: user.id,
              action: 'login_locked',
              metadata: {},
            });
          } catch { /* fail open */ }
          throw new Error('ACCOUNT_LOCKED');
        }

        const passwordValid = await bcrypt.compare(password, user.hashedPassword);

        // LOW-05: Track failed attempts
        if (!passwordValid) {
          const attempts = (user.failedLoginAttempts ?? 0) + 1;
          const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await db.update(schema.users)
            .set({
              failedLoginAttempts: attempts,
              lockedUntil: lockUntil,
            })
            .where(eq(schema.users.id, user.id));
          // FEAT-03: Audit log for failed login
          try {
            await db.insert(schema.auditLogs).values({
              userId: user.id,
              action: 'login_failed',
              metadata: { attempt: attempts },
            });
          } catch { /* fail open */ }
          return null;
        }

        // Reset lockout counter on successful password
        await db.update(schema.users)
          .set({ failedLoginAttempts: 0, lockedUntil: null })
          .where(eq(schema.users.id, user.id));

        // FEAT-05: Gradual password re-hashing — upgrade if cost < 12
        try {
          const costMatch = user.hashedPassword.match(/^\$2[ab]\$(\d+)\$/);
          const currentCost = costMatch && costMatch[1] ? parseInt(costMatch[1], 10) : 0;
          if (currentCost < 12) {
            const upgradedHash = await bcrypt.hash(password, 12);
            await db.update(schema.users)
              .set({ hashedPassword: upgradedHash })
              .where(eq(schema.users.id, user.id));
          }
        } catch { /* fail open */ }

        // HIGH-01: 2FA check — decrypt secret before verifying
        if (user.twoFactorEnabled) {
          const { verifySync } = await import('otplib');
          const totpCode =
            typeof credentials?.totpCode === 'string' ? credentials.totpCode.trim() : '';
          if (!totpCode) {
            throw new Error('2FA_REQUIRED');
          }
          const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
          if (!decryptedSecret) {
            throw new Error('2FA secret is corrupted. Please re-enable 2FA.');
          }
          const isValid = verifySync({ secret: decryptedSecret, token: totpCode }).valid;
          if (!isValid) {
            throw new Error('INVALID_2FA_CODE');
          }
        }

        // BUG-05 + FEAT-02: Create session record on login with device/IP
        let sessionId = '';
        try {
          sessionId = crypto.randomUUID();
          await db.insert(schema.userSessions).values({
            id: sessionId,
            userId: user.id,
            deviceName: reqUserAgent,
            ip: reqIp,
            createdAt: new Date(),
            lastActiveAt: new Date(),
          });
        } catch (err) {
          console.error('[auth] Failed to create session record:', err);
        }

        // FEAT-03: Audit log for successful login
        try {
          await db.insert(schema.auditLogs).values({
            userId: user.id,
            action: 'login',
            metadata: {},
          });
        } catch { /* fail open */ }

        const c = credentials as Record<string, unknown> | undefined;
        const rememberMe = typeof c?.rememberMe === 'string' && c.rememberMe === 'true';

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          tokenVersion: user.tokenVersion,
          sessionId: sessionId,
          rememberMe,
        };
      },
    }),
    // FEAT-01: Optional OAuth providers (Google, GitHub)
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
      : []),
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET })]
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

