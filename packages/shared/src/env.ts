// Server-only environment validation. Imported at boot in apps/web (route
// handlers + middleware) and in any package that touches secrets.
//
// Every variable here MUST also appear in `.env.example` at the repo root.
// Keep this file the single source of truth — never re-validate elsewhere.

import { z } from 'zod';

/**
 * Auth (personal-mode):
 *   - APP_PASSWORD: the single password you'll type into /login.
 *   - AUTH_COOKIE_SECRET: HMAC secret for the signed session cookie.
 *   - CRON_SECRET: bearer token Vercel uses to invoke /api/cron/*.
 */
const AuthEnv = z.object({
  APP_PASSWORD: z.string().min(8, 'APP_PASSWORD must be at least 8 characters'),
  AUTH_COOKIE_SECRET: z.string().min(32, 'AUTH_COOKIE_SECRET must be at least 32 chars'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 chars'),
});

// We accept either DATABASE_URL or POSTGRES_URL — the Supabase Vercel
// integration writes POSTGRES_URL (transaction pooler, prepare-statement-safe
// when the client is configured with `prepare: false`). At consume time the
// adapter resolves whichever is set; both being unset fails validation.
const DbEnv = z
  .object({
    DATABASE_URL: z.string().url().optional(),
    POSTGRES_URL: z.string().url().optional(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
  })
  .refine((v) => Boolean(v.DATABASE_URL || v.POSTGRES_URL), {
    message: 'Either DATABASE_URL or POSTGRES_URL must be set',
    path: ['DATABASE_URL'],
  });

const AiEnv = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1),
  AI_DEFAULT_MODEL: z.string().default('openai/gpt-4.1'),
  AI_TITLE_MODEL: z.string().default('openai/gpt-4.1-mini'),
  AI_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
});

// Upstash Redis is intentionally OPTIONAL. Personal-mode caching uses Next.js's
// built-in Data Cache (`fetch`-cache + `unstable_cache`) which is free, persists
// across invocations on Vercel, and covers our entire TTL policy. Setting these
// vars is supported as a future swap-in but no code path requires them today.
//
// See docs/06-data-sources.md § "Cache layer" and packages/data/src/cache/.
const CacheEnv = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

const ProvidersEnv = z.object({
  TWELVEDATA_API_KEY: z.string().min(1),
  FINNHUB_API_KEY: z.string().min(1).optional(),
  ALPHAVANTAGE_API_KEY: z.string().min(1).optional(),
  MARKETAUX_API_KEY: z.string().min(1).optional(),
  TRADING_ECONOMICS_KEY: z.string().min(1).optional(),
  FRED_API_KEY: z.string().min(1).optional(),
});

const NotifyEnv = z.object({
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM_EMAIL: z.string().email().optional(),
  ALERT_TO_EMAIL: z.string().email().optional(),
});

const PublicEnv = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

const RuntimeEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Daily AI cost ceiling in USD. When crossed, /api/chat returns 503. */
  MAX_DAILY_USD: z.coerce.number().positive().default(5),
  /** Hard cap on tool-loop iterations per chat turn. */
  MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().default(6),
  LOG_PROMPTS: z
    .union([z.literal('0'), z.literal('1')])
    .default('0')
    .transform((v) => v === '1'),
});

// `merge()` doesn't compose ZodEffects (refines), so we intersect DbEnv with
// the rest. `intersection()` preserves both the inferred shape and the refine.
export const ServerEnvSchema = z.intersection(
  DbEnv,
  AuthEnv.merge(AiEnv)
    .merge(CacheEnv)
    .merge(ProvidersEnv)
    .merge(NotifyEnv)
    .merge(PublicEnv)
    .merge(RuntimeEnv),
);

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/** Resolve the active Postgres connection string, preferring DATABASE_URL. */
export function resolveDatabaseUrl(env: Pick<ServerEnv, 'DATABASE_URL' | 'POSTGRES_URL'>): string {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error('Neither DATABASE_URL nor POSTGRES_URL is set');
  return url;
}

/**
 * Parse process.env into a typed env object. Throws a readable error listing
 * every missing/invalid variable. Cache the result at module-scope in callers.
 */
export function parseServerEnv(input: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = ServerEnvSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
