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
import { and, eq, isNull, sql } from 'drizzle-orm';
import NextAuth from 'next-auth';
import { AuthError } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { verifySync } from 'otplib';
import { decryptSecret } from '@hamafx/shared/encryption';
import { authConfig } from './auth.config';
import { getDb, schema } from '@hamafx/db';
import { logErrorContext } from '@hamafx/shared/logger';
import { getAuthEnv } from '@/lib/env';
import { recordAuthEvent } from '@/lib/auth-anomaly';

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

const _authEnv = (() => { try { return getAuthEnv(); } catch { return {} as Record<string, string | undefined>; } })();
const GOOGLE_ENABLED =
  !!(_authEnv.AUTH_GOOGLE_ID && _authEnv.AUTH_GOOGLE_SECRET);

/**
 * Known bcrypt hash used for constant-time comparison when no user is found.
 * Prevents timing-based user enumeration (P2-1).
 * Hash of 'dummy-password-for-timing-defense' at cost 12.
 */
const DUMMY_HASH =
  '$2b$12$LyYuAYJhLrPU7mAIQPzVNu5HBJ/neEmE2uZZDD5ayPPROn5ruSaJ2';

export const { handlers, auth, signIn, signOut } = _nextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: '2FA Code', type: 'text' },
        rememberMe: { label: 'Remember Me', type: 'text' },
        deviceName: { label: 'Device Name', type: 'text' },
        ip: { label: 'IP Address', type: 'text' },
      },
      async authorize(credentials, _req) {
        const email =
          typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        const db = getDb();

        // ── Step 1: Fetch user (with 2FA fields + lockout state) ──────
        let user: {
          id: string;
          email: string;
          name: string | null;
          image: string | null;
          hashedPassword: string | null;
          tokenVersion: number;
          twoFactorEnabled: boolean;
          twoFactorSecret: string | null;
          lockedUntil: Date | null;
          failedLoginAttempts: number;
          emailVerified: Date | null;
        } | undefined;
        try {
          [user] = await db
            .select({
              id: schema.users.id,
              email: schema.users.email,
              name: schema.users.name,
              image: schema.users.image,
              hashedPassword: schema.users.hashedPassword,
              tokenVersion: schema.users.tokenVersion,
              twoFactorEnabled: schema.users.twoFactorEnabled,
              twoFactorSecret: schema.users.twoFactorSecret,
              lockedUntil: schema.users.lockedUntil,
              failedLoginAttempts: schema.users.failedLoginAttempts,
              emailVerified: schema.users.emailVerified,
            })
            .from(schema.users)
            .where(and(
              eq(schema.users.email, email),
              isNull(schema.users.deletedAt),
            ))
            .limit(1);
        } catch (err) {
          logErrorContext(err, 'auth/db_fetch_user_failed', {}, 'auth');
          return null; // fail closed on unexpected DB errors
        }

        // ── P2-1: Constant-time fallback when no user / no password ──
        if (!user || !user.hashedPassword) {
          // Run bcrypt against a dummy hash to equalize response time,
          // preventing user-enumeration via timing side-channel.
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        // ── P0-2: Check lockout (propagates out — NOT caught) ──────────
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          recordAuthEvent('account_locked');
          throw new AuthError('ACCOUNT_LOCKED');
        }

        // ── Step 2: Verify password ────────────────────────────────────
        let passwordValid: boolean;
        try {
          passwordValid = await bcrypt.compare(password, user.hashedPassword);
        } catch (err) {
          logErrorContext(err, 'auth/bcrypt_error', {}, 'auth');
          return null; // fail closed on unexpected bcrypt errors
        }

        if (!passwordValid) {
          // ── P2-2: Atomic SQL increment (no read-modify-write race) ──
          try {
            await db
              .update(schema.users)
              .set({
                failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`,
                lockedUntil: sql`CASE WHEN ${schema.users.failedLoginAttempts} + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END`,
              })
              .where(eq(schema.users.id, user.id));
          } catch {
            /* fail open — lockout is best-effort */
          }
          return null;
        }

        // ── Reset lockout counter on successful password ───────────────
        try {
          await db
            .update(schema.users)
            .set({ failedLoginAttempts: 0, lockedUntil: null })
            .where(eq(schema.users.id, user.id));
        } catch {
          /* fail open */
        }

        // ── P0-1: Enforce 2FA at login ─────────────────────────────────
        if (user.twoFactorEnabled) {
          const totpCode =
            typeof credentials?.totpCode === 'string'
              ? credentials.totpCode.trim()
              : '';
          if (!totpCode) {
            throw new AuthError('2FA_REQUIRED');
          }
          const secret = user.twoFactorSecret
            ? decryptSecret(user.twoFactorSecret)
            : null;
          if (
            !secret ||
            !verifySync({ secret, token: totpCode }).valid
          ) {
            recordAuthEvent('2fa_failure');
            throw new AuthError('INVALID_2FA_CODE');
          }
        }

        // ── P0-3: Read rememberMe from credentials ─────────────────────
        const rememberMe = credentials?.rememberMe === 'true';

        // ── P0-4: Generate sessionId + capture device info ──────────
        const sessionId = crypto.randomUUID();
        const deviceName =
          typeof credentials?.deviceName === 'string'
            ? credentials.deviceName.slice(0, 255) || null
            : null;
        const ip =
          typeof credentials?.ip === 'string'
            ? credentials.ip || null
            : null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          tokenVersion: user.tokenVersion,
          emailVerified: user.emailVerified,
          sessionId,
          deviceName,
          ip,
          rememberMe,
        };
      },
    }),
    // P1-2: Google OAuth — conditional on env vars so self-hosters
    // without Google keys are unaffected.
    ...(GOOGLE_ENABLED
      ? [
          Google({
            clientId: _authEnv.AUTH_GOOGLE_ID!,
            clientSecret: _authEnv.AUTH_GOOGLE_SECRET!,
            allowDangerousEmailAccountLinking: false, // we link explicitly in signIn
          }),
        ]
      : []),
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
    /**
     * P1-2 / §4.3: Provision DB rows for Google OAuth sign-ins.
     * Links existing Credentials users by email; creates new user +
     * user_settings for first-time Google sign-ins. Google emails are
     * pre-verified so emailVerified is set automatically.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account, profile }: { user: any; account: any; profile: any }) {
      if (account?.provider !== 'google') return true;
      if (!profile?.email || profile.email_verified === false) return false;

      const email = profile.email.toLowerCase().trim();
      const db = getDb();

      // Find existing user by email (link accounts)
      const [existing] = await db
        .select({ id: schema.users.id, tokenVersion: schema.users.tokenVersion })
        .from(schema.users)
        .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
        .limit(1);

      let userId = existing?.id;

      if (!userId) {
        // Create new OAuth user
        userId = crypto.randomUUID();
        // Drizzle transaction types are complex with multi-table schemas.
        // Use the same double-cast pattern as withTenantDb in client.ts.
        const newUserId = userId; // narrow to string for the transaction closure
        await db.transaction(async (tx) => {
          const t = tx as unknown as typeof db;
          await t.insert(schema.users).values({
            id: newUserId,
            email,
            name: profile.name ?? email,
            image:
              profile.picture ??
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(String(profile.name ?? email))}`,
            emailVerified: new Date(),
            hashedPassword: null,
          });
          await t.insert(schema.userSettings).values({
            userId: newUserId,
            onboardingCompleted: false,
            defaultSymbol: 'XAUUSD',
          });
        });
      } else {
        // Ensure emailVerified is set for linked accounts
        await db
          .update(schema.users)
          .set({ emailVerified: new Date() })
          .where(eq(schema.users.id, userId));
      }

      // Upsert account link row
      await db
        .insert(schema.accounts)
        .values({
          userId,
          type: account.type as string,
          provider: 'google',
          providerAccountId: account.providerAccountId as string,
          access_token: (account.access_token as string) ?? null,
          refresh_token: (account.refresh_token as string) ?? null,
          expires_at: (account.expires_at as number) ?? null,
          token_type: (account.token_type as string) ?? null,
          scope: (account.scope as string) ?? null,
          id_token: (account.id_token as string) ?? null,
        })
        .onConflictDoNothing();

      // Stash canonical DB id + tokenVersion so JWT callback uses them
      user.id = userId;
      user.tokenVersion = existing?.tokenVersion ?? 0;
      user.emailVerified = new Date();
      user.rememberMe = true; // OAuth users default to remembered
      user.sessionId = crypto.randomUUID();

      return true;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id;
        token.tokenVersion = user.tokenVersion ?? 0;
        token.emailVerified = user.emailVerified ?? null;
        token.rememberMe = user.rememberMe === true ? true : undefined;

        // P0-4: Create user_sessions row on first JWT mint.
        // tenantId has a DB-side SQL default; not passing it here
        // so Postgres applies current_setting('app.current_tenant', true).
        const sessionId = user.sessionId || crypto.randomUUID();
        token.sessionId = sessionId;
        try {
          const db = getDb();
          await db.execute(
            sql`INSERT INTO ${schema.userSessions} (id, user_id, device_name, ip)
                VALUES (${sessionId}, ${user.id}, ${(user.deviceName as string) ?? null}, ${(user.ip as string) ?? null})`,
          );
        } catch {
          /* fail open */
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
      // P0-5: expose emailVerified on session for soft enforcement
      if (token.emailVerified !== undefined) {
        session.user.emailVerified = token.emailVerified;
      }
      if (token.sessionId) {
        session.sessionId = token.sessionId;
      }
      const now = Math.floor(Date.now() / 1000);

      // FEAT-04: Without rememberMe, invalidate sessions older than 24h
      if (token.iat && token.rememberMe !== true && now - (token.iat as number) > 86400) {
        return { ...session, user: undefined, expires: '0' };
      }

      // tokenVersion check every 5 min
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

      // P0-4: Validate session still exists (revokeSessionAction deletes it)
      const sessionId = token.sessionId as string | undefined;
      const lastSessionCheck = token.sessionCheckAt as number | undefined;
      if (sessionId && (!lastSessionCheck || now - lastSessionCheck > 300)) {
        try {
          const db = getDb();
          const [sess] = await db
            .select({ id: schema.userSessions.id })
            .from(schema.userSessions)
            .where(eq(schema.userSessions.id, sessionId))
            .limit(1);
          if (!sess) {
            // Session was revoked — invalidate
            return { ...session, user: undefined, expires: '0' };
          }
          token.sessionCheckAt = now;
        } catch {
          // DB error — fail open
        }
      }

      // FEAT-02: Track last active time every 15 min
      const lastActiveUpdate = token.lastActiveUpdate as number | undefined;
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

