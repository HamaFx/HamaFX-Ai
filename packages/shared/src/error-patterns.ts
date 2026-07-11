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

import { AppError, type ErrorCode } from './errors';

export interface ErrorPattern {
  /** Pattern to match against error message/code */
  pattern: RegExp | string;
  /** Error code if known */
  code?: ErrorCode;
  /** Human-readable description */
  description: string;
  /** Suggested fix for AI agents */
  suggestedFix: string;
  /** Related files to check */
  relatedFiles: string[];
  /** Related documentation */
  docs?: string;
  /** Whether the error is retryable */
  retryable: boolean;
}

export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /User settings not found.*onboarding/i,
    description: 'User has not completed onboarding',
    suggestedFix:
      'Check if user_settings.onboarding_completed is true. If not, redirect to /onboarding. Use the admin onboarding reset endpoint to test.',
    relatedFiles: [
      'apps/web/src/app/(app)/layout.tsx',
      'apps/web/src/app/onboarding/actions.ts',
      'packages/ai/src/agent.ts',
    ],
    retryable: false,
  },
  {
    pattern: /Daily AI budget exceeded/i,
    code: 'BUDGET_EXCEEDED',
    description: 'Daily AI spend cap reached',
    suggestedFix:
      'Increase MAX_DAILY_USD env var or reset the budget counter. Check cost tracking in packages/ai/src/cost.ts.',
    relatedFiles: ['packages/ai/src/cost.ts'],
    retryable: false,
  },
  {
    pattern: /pgvector extension not installed/i,
    description: 'pgvector extension missing from database',
    suggestedFix:
      "Run: CREATE EXTENSION IF NOT EXISTS vector; on the database. Check docker/postgres/init-langfuse-db.sh.",
    relatedFiles: ['apps/web/src/app/api/health/route.ts', 'docker/postgres/init-langfuse-db.sh'],
    retryable: false,
  },
  {
    pattern: /ENCRYPTION_SECRET/i,
    description: 'Encryption secret not configured',
    suggestedFix:
      'Set ENCRYPTION_SECRET env var to a 32-byte hex string. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    relatedFiles: ['packages/shared/src/encryption.ts', 'packages/shared/src/env.ts'],
    retryable: false,
  },
  {
    pattern: /missing.*migrations/i,
    description: 'Database migrations are behind',
    suggestedFix:
      'Run: pnpm --filter @hamafx/db exec drizzle-kit migrate. Check migration count in /api/health/db.',
    relatedFiles: ['packages/db/drizzle.config.ts', 'apps/web/src/app/api/health/db/route.ts'],
    retryable: false,
  },
  {
    pattern: /CSRF.*missing.*invalid/i,
    description: 'CSRF token validation failed',
    suggestedFix:
      'Ensure the hfx_csrf cookie is set and the x-csrf-token header matches it. Check middleware.ts CSRF logic and withCsrf() helper.',
    relatedFiles: ['apps/web/src/middleware.ts', 'apps/web/src/lib/csrf.ts'],
    retryable: false,
  },
  {
    pattern: /provider.*unavailable|PROVIDER_UNAVAILABLE/i,
    code: 'PROVIDER_UNAVAILABLE',
    description: 'Market data provider is unavailable',
    suggestedFix:
      'Check if the provider API key is valid. Use /api/settings/test-provider to test. Check circuit breaker state in packages/data/src/circuit-breaker.ts.',
    relatedFiles: ['packages/data/src/circuit-breaker.ts', 'packages/data/src/failover.ts'],
    retryable: true,
  },
  {
    pattern: /UNAUTHORIZED|Unauthorized/i,
    code: 'UNAUTHORIZED',
    description: 'Authentication required or session expired',
    suggestedFix:
      'Check the auth session cookie / JWT. If expired, redirect to /login. Verify NEXTAUTH_SECRET and tokenVersion.',
    relatedFiles: ['apps/web/src/auth.ts', 'apps/web/src/middleware.ts'],
    retryable: false,
  },
  {
    pattern: /FORBIDDEN|Forbidden/i,
    code: 'FORBIDDEN',
    description: 'User lacks permission for the requested resource',
    suggestedFix:
      'Verify the user role in the users table. Admin routes require role=admin or single-user mode fallback.',
    relatedFiles: ['apps/web/src/lib/admin-auth.ts', 'packages/db/src/schema/auth.ts'],
    retryable: false,
  },
  {
    pattern: /RATE_LIMITED|Too Many Requests/i,
    code: 'RATE_LIMITED',
    description: 'Rate limit exceeded',
    suggestedFix:
      'Check rate limit configuration in packages/db/src/rate-limits.ts. Increase the limit or add backoff/retry logic.',
    relatedFiles: ['packages/db/src/rate-limits.ts', 'packages/db/src/schema/rate-limits.ts'],
    retryable: true,
  },
  {
    pattern: /VALIDATION/i,
    code: 'VALIDATION',
    description: 'Request validation failed',
    suggestedFix:
      'Inspect the request payload against the zod schema. Check the details field for field-level errors.',
    relatedFiles: ['packages/shared/src/errors.ts'],
    retryable: false,
  },
  {
    pattern: /NOT_FOUND/i,
    code: 'NOT_FOUND',
    description: 'Requested resource was not found',
    suggestedFix:
      'Verify the resource ID exists in the database. Check for typos in identifiers and tenant scoping.',
    relatedFiles: ['packages/db/src/schema'],
    retryable: false,
  },
  {
    pattern: /INTERNAL/i,
    code: 'INTERNAL',
    description: 'Unhandled internal server error',
    suggestedFix:
      'Check the structured error log for the original stack trace. Look for the traceId and requestId to correlate with diagnostic traces.',
    relatedFiles: ['packages/shared/src/logger.ts', 'packages/ai/src/diagnostics/run-context.ts'],
    retryable: false,
  },
];

export function findErrorPattern(err: unknown): ErrorPattern | null {
  const message = err instanceof Error ? err.message : String(err);
  const code = err instanceof AppError ? err.code : undefined;

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.code && pattern.code === code) return pattern;
    if (typeof pattern.pattern === 'string') {
      if (message.includes(pattern.pattern)) return pattern;
    } else if (pattern.pattern.test(message)) {
      return pattern;
    }
  }
  return null;
}
