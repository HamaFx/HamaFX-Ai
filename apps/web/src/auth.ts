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
import { authConfig } from './auth.config';
import { getDb } from '@hamafx/db';

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
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string' ? credentials.email.toLowerCase().trim() : '';
        if (!email) return null;

        // MINIMAL authorize — skip DB entirely for now
        return {
          id: 'test-user-id',
          email,
          name: 'Test User',
        };
      },
    }),
  ],
});
