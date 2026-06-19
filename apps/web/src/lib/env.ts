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

// Lazy, cached env access. Three scopes:
//   - getAuthEnv(): only auth-related vars. Safe to use from Edge middleware
//     because it doesn't require AI / DB / data-provider keys to be set.
//   - getServerEnv(): the full ServerEnv (Auth + DB + AI + Cache + Providers + ...).
//     Used by route handlers that actually need those keys.
//
// Phase A: added NEXTAUTH_SECRET for NextAuth.js v5 JWT signing.
// APP_PASSWORD is now optional — used only for legacy admin bootstrapping.
//
// We never throw at import time — errors surface on first call so a missing
// env doesn't break unrelated routes during dev.

import { parseServerEnv, type ServerEnv } from '@hamafx/shared';
import { z } from 'zod';

const AuthEnvSchema = z.object({
  // Phase A: NextAuth required. APP_PASSWORD is now optional (legacy bootstrapping only).
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 chars'),
  APP_PASSWORD: z.string().min(4).optional(),
  AUTH_COOKIE_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

export type AuthEnv = z.infer<typeof AuthEnvSchema>;

let _authEnv: AuthEnv | null = null;
let _serverEnv: ServerEnv | null = null;

export function getAuthEnv(): AuthEnv {
  if (_authEnv) return _authEnv;
  const result = AuthEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid auth environment:\n${issues}`);
  }
  _authEnv = result.data;
  return _authEnv;
}

export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;
  _serverEnv = parseServerEnv();
  return _serverEnv;
}
