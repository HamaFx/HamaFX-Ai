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

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { authConfig } from './auth.config';
import { getDb, schema, withRateLimit } from '@hamafx/db';

// Phase B — brute-force protection on login.
// 10 attempts per email per minute is the default. Tunable via env.
// We key on the lowercased email so `Foo@x.com` and `foo@x.com` share
// the same bucket (the email is also normalised before lookup).
const LOGIN_RATE_LIMIT = Number(process.env.LOGIN_RATE_LIMIT ?? '10');

// `NextAuth()` returns a value whose inferred type carries deep paths into
// `@auth/core/providers`. That inferred type isn't portable across pnpm
// store layouts (TS error TS2742). We side-step the portability error by
// typing the destructured exports with the structural shape we need,
// rather than re-naming the inferred type. The @ts-ignore on the right-hand
// side suppresses the only error TS reports; consumers re-narrow as needed.
// See: https://github.com/nextauthjs/next-auth/discussions/9138
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _nextAuth = NextAuth as any;
export const { handlers, auth, signIn, signOut } = _nextAuth({
  ...authConfig,
  ...(process.env.DATABASE_URL || process.env.POSTGRES_URL ? { adapter: DrizzleAdapter(getDb()) } : {}),
  providers: [
    Credentials({
      name: 'Email + Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;

        // Phase B — per-email brute-force throttle. Counts failed
        // attempts too (because we run this before the bcrypt check).
        // Returns null on rate-limit hit so NextAuth treats it as a
        // generic auth failure (no info leak about whether the email
        // exists or how many tries remain).
        const rl = await withRateLimit(`login:${email}`, 'auth_login', LOGIN_RATE_LIMIT);
        if (!rl.allowed) {
          console.error(`[auth] Rate limit exceeded for ${email}`);
          return null;
        }

        const db = getDb();
        const rows = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1);

        const user = rows[0];
        if (!user || !user.hashedPassword) {
          console.error(`[auth] User not found or missing password for ${email}`);
          return null;
        }

        const ok = await bcrypt.compare(password, user.hashedPassword);
        if (!ok) {
          console.error(`[auth] Invalid password for ${email}`);
          return null;
        }

        // The shape NextAuth expects from authorize(): the returned object
        // gets folded into the JWT by the `jwt` callback in auth.config.ts.
        // With `exactOptionalPropertyTypes: true`, optional fields must be
        // either omitted entirely or set to a non-undefined value. We omit
        // `name` when missing rather than passing `undefined`.
        return {
          id: user.id,
          email: user.email,
          ...(user.name ? { name: user.name } : {}),
        };
      },
    }),
  ],
  // session.strategy is 'jwt' from authConfig — keeps the Edge-safe
  // middleware path working without a DB roundtrip. The DrizzleAdapter
  // is still wired for the OAuth case (user/account/verification tables)
  // even though we only use Credentials today.
});
