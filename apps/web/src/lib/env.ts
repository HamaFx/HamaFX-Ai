// Lazy, cached env access. Two scopes:
//   - getAuthEnv(): only auth-related vars. Safe to use from Edge middleware
//     because it doesn't require AI / DB / data-provider keys to be set.
//   - getServerEnv(): the full ServerEnv (Auth + DB + AI + Cache + Providers + ...).
//     Used by route handlers that actually need those keys.
//
// We never throw at import time — errors surface on first call so a missing
// env doesn't break unrelated routes during dev.

import { parseServerEnv, type ServerEnv } from '@hamafx/shared';
import { z } from 'zod';

const AuthEnvSchema = z.object({
  APP_PASSWORD: z.string().min(8),
  AUTH_COOKIE_SECRET: z.string().min(32),
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
