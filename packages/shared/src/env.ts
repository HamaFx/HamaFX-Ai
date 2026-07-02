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

// Server-only environment validation. Imported at boot in apps/web (route
// handlers + middleware) and in any package that touches secrets.
//
// Every variable here MUST also appear in `.env.example` at the repo root.
// Keep this file the single source of truth — never re-validate elsewhere.

import { z } from 'zod';

/**
 * Auth (personal-mode):
 *   - NEXTAUTH_SECRET: HMAC secret for NextAuth.js v5 JWT signing.
 *   - AUTH_COOKIE_SECRET: legacy cookie signer. Optional — kept for
 *     backward compatibility with personal-mode deployments.
 *   - CRON_SECRET: bearer token Vercel uses to invoke /api/cron/*.
 *   - ENCRYPTION_SECRET: 32-byte hex used to encrypt BYOK payloads.
 *
 * Development ergonomics: in NODE_ENV !== 'production' the secrets
 * are OPTIONAL. The web app's `getServerEnv()`/`getAuthEnv()` will
 * auto-generate cryptographically-strong values when missing and
 * persist them to `.hamafx/dev-secrets.json` so encrypted BYOK payloads
 * survive restarts. Production-time enforcement is applied at the
 * ServerEnvSchema refinement below.
 */
const AuthEnv = z.object({
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars').optional(),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 chars').optional(),
  AUTH_COOKIE_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 chars').optional(),
  ENCRYPTION_SECRET: z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 chars').optional(),
});

// We accept either DATABASE_URL or POSTGRES_URL for app traffic — the Supabase
// Vercel integration writes POSTGRES_URL (transaction pooler, prepare-statement-safe
// when the client is configured with `prepare: false`). Phase 3 adds DIRECT_URL /
// POSTGRES_URL_NON_POOLING for migrations, backups, and other session-bound tasks.
const DbEnv = z
  .object({
    DATABASE_URL: z.string().url().optional(),
    POSTGRES_URL: z.string().url().optional(),
    DIRECT_URL: z.string().url().optional(),
    POSTGRES_URL_NON_POOLING: z.string().url().optional(),
    SUPABASE_CA_CERT: z.string().optional(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
  })
  .refine((v) => Boolean(v.DATABASE_URL || v.POSTGRES_URL), {
    message: 'Either DATABASE_URL or POSTGRES_URL must be set',
    path: ['DATABASE_URL'],
  });

// AI provider env. We support three transports:
//
//   1. Google Vertex AI (direct): set `GOOGLE_VERTEX_PROJECT`,
//                                 `GOOGLE_VERTEX_LOCATION`, and either
//                                 `GOOGLE_APPLICATION_CREDENTIALS_JSON`
//                                 (full SA key JSON, single-line) or
//                                 `GOOGLE_APPLICATION_CREDENTIALS` (path).
//                                 Model ids must be prefixed `google-vertex/`.
//                                 Billed against your GCP project.
//   2. Vercel AI Gateway:         set `AI_GATEWAY_API_KEY`. Models routed by
//                                 prefixed id (e.g. `openai/gpt-4.1`).
//                                 Billed by Vercel.
//   3. Direct Google Gemini API:  set `GOOGLE_GENERATIVE_AI_API_KEY`. Pair
//                                 with a `google/...` model id. Free tier.
//
// At least one transport must be configured. The resolver in
// packages/ai/src/model.ts picks per-call based on the model id prefix.
//
// Phase 7a: domain-based model routing. The agent classifies each user turn
// into one of {fundamental, technical, summary, vision, generic} and picks
// the model from the matching env var below. All defaults stay safe — if
// you don't set the new vars, behaviour falls back to AI_DEFAULT_MODEL.
const AiEnv = z
  .object({
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    GOOGLE_VERTEX_PROJECT: z.string().min(1).optional(),
    GOOGLE_VERTEX_LOCATION: z.string().min(1).optional(),
    GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().min(1).optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),
    AI_DEFAULT_MODEL: z.string().default('google-vertex/gemini-2.5-flash'),
    /**
     * Auto-title generator (first-turn thread title) and operator-set
     * fallback for the planner-style cheap model. Per-user picks come
     * from `user_settings.chat_model` + `derivePlannerModel` / `deriveTitleModel`.
     */
    AI_TITLE_MODEL: z.string().default('google-vertex/gemini-2.5-flash-lite'),
    AI_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
  })
  .refine(
    (v) =>
      Boolean(
        v.AI_GATEWAY_API_KEY ||
        v.GOOGLE_GENERATIVE_AI_API_KEY ||
        (v.GOOGLE_VERTEX_PROJECT && v.GOOGLE_VERTEX_LOCATION),
      ),
    {
      message:
        'Configure one AI transport: GOOGLE_VERTEX_PROJECT+GOOGLE_VERTEX_LOCATION, AI_GATEWAY_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY',
      path: ['AI_GATEWAY_API_KEY'],
    },
  );

// Upstash Redis is intentionally OPTIONAL. Personal-mode caching uses Next.js's
// built-in Data Cache (`fetch`-cache + `unstable_cache`) which is free, persists
// across invocations on Vercel, and covers our entire TTL policy. Setting these
// vars is supported as a future swap-in but no code path requires them today.
//
// See docs/04-data-layer.md § "Cache layer" and packages/data/src/cache/.
const CacheEnv = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

const ProvidersEnv = z.object({
  // Phase 8 PR-19 retired Twelve Data; Phase 3 hardening §18 removed
  // the leftover env field. BiQuote is the primary; Finnhub is the
  // fallback. If a deployment still has `TWELVEDATA_API_KEY` set in
  // Vercel envs, the value is now ignored — it doesn't cause
  // validation to fail because Zod's strict mode isn't on for this
  // schema.
  FINNHUB_API_KEY: z.string().min(1).optional(),
  ALPHAVANTAGE_API_KEY: z.string().min(1).optional(),
  MARKETAUX_API_KEY: z.string().min(1).optional(),
  TRADING_ECONOMICS_KEY: z.string().min(1).optional(),
  FRED_API_KEY: z.string().min(1).optional(),
  /**
   * BiQuote (https://biquote.io) — free, no-key REST + SignalR market data.
   * Phase 8 promotes BiQuote to the primary price/candle source. There is
   * no API key; this var only overrides the base URL (e.g. for staging or a
   * local mock during tests). Default: https://biquote.io.
   */
  BIQUOTE_BASE_URL: z.string().url().optional(),
});

const NotifyEnv = z.object({
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_SECRET_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ALERT_FROM_EMAIL: z.string().email().optional(),
  ALERT_TO_EMAIL: z.string().email().optional(),
  /**
   * Web Push (RFC 8030 + VAPID). All optional — when missing, the
   * `web-push` alert channel returns "not configured" and skips delivery.
   *
   * The public key MUST also be exposed as NEXT_PUBLIC_VAPID_PUBLIC_KEY so
   * the browser-side `pushManager.subscribe` call can pass it as the
   * `applicationServerKey`. The two values must match exactly.
   *
   * Generate a fresh keypair with:
   *   node -e "const {generateKeyPairSync} = require('crypto'); \
   *     const {publicKey, privateKey} = generateKeyPairSync('ec', { namedCurve: 'P-256' }); \
   *     console.log('PUB',  publicKey.export({format:'jwk'}).x + publicKey.export({format:'jwk'}).y); \
   *     console.log('PRIV', privateKey.export({format:'jwk'}).d);"
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** Contact email or `mailto:` URL embedded in the VAPID JWT `sub` claim. */
  VAPID_SUBJECT: z.string().optional(),
});

/**
 * NOWPayments (crypto billing) — Phase A/B of the billing integration plan.
 *
 * All optional: billing routes are feature-flagged and no-op when unset.
 * In production with billing enabled, set all three.
 *
 *   NOWPAYMENTS_API_KEY     — x-api-key header for REST API calls
 *   NOWPAYMENTS_IPN_SECRET  — HMAC-SHA512 shared secret for webhook verification
 *   NOWPAYMENTS_API_BASE    — sandbox (api-sandbox.nowpayments.io) or live (api.nowpayments.io)
 */
const BillingEnv = z.object({
  NOWPAYMENTS_API_KEY: z.string().min(1).optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().min(1).optional(),
  NOWPAYMENTS_API_BASE: z
    .string()
    .url()
    .default('https://api-sandbox.nowpayments.io'),
});

const PublicEnv = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  /** Browser-readable VAPID public key. MUST equal `VAPID_PUBLIC_KEY`. */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
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
  /**
   * Phase 8 PR-18 — Sentry server-only. Optional. When unset, the
   * instrumentation hook is a no-op. The web app NEVER includes the
   * client SDK; client errors stay in Vercel logs / error boundaries.
   */
  SENTRY_DSN: z.string().url().optional(),
  /** Langfuse LLM observability. Optional — omitted = tracing disabled. */
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),

  // Feature Flags
  MULTI_USER_ENABLED: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  BYOK_ENABLED: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  UNLIMITED_SYMBOLS: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
  PER_USER_BRIEFINGS: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .default('0')
    .transform((v) => v === '1' || v === 'true'),
});

// `merge()` doesn't compose ZodEffects (refines). Both DbEnv and AiEnv are
// refined, so we intersect them with the rest. `intersection()` preserves
// each branch's inferred shape and validations.
//
// Production-only refinement: secrets become REQUIRED when NODE_ENV is
// 'production'. We can't refine AuthEnv in isolation because NODE_ENV lives
// in RuntimeEnv — by checking after the intersection we see the combined shape.
export const ServerEnvSchema = z
  .intersection(
    z.intersection(DbEnv, AiEnv),
    AuthEnv.merge(CacheEnv)
      .merge(ProvidersEnv)
      .merge(NotifyEnv)
      .merge(BillingEnv)
      .merge(PublicEnv)
      .merge(RuntimeEnv),
  )
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      Boolean((env.AUTH_SECRET || env.NEXTAUTH_SECRET) && env.CRON_SECRET && env.ENCRYPTION_SECRET),
    {
      message:
        'In production, AUTH_SECRET (or NEXTAUTH_SECRET), CRON_SECRET, and ENCRYPTION_SECRET are all required. ' +
        'Set them in your Vercel project (Settings → Environment Variables) for Production ' +
        '+ Preview scopes, or in your local .env.local for `pnpm dev:local`.',
      path: ['AUTH_SECRET'],
    },
  );

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
/**
 * Resolve the active Postgres connection string for app traffic, preferring DATABASE_URL.
 */
export function resolveDatabaseUrl(env: Pick<ServerEnv, 'DATABASE_URL' | 'POSTGRES_URL'>): string {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error('Neither DATABASE_URL nor POSTGRES_URL is set');
  return url;
}

/**
 * Resolve the direct/session-mode Postgres connection string for migrations,
 * backups, and other session-bound operations.
 */
export function resolveDirectDatabaseUrl(
  env: Pick<ServerEnv, 'DIRECT_URL' | 'POSTGRES_URL_NON_POOLING' | 'DATABASE_URL' | 'POSTGRES_URL'>,
): string {
  const url =
    env.DIRECT_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'Neither DIRECT_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, nor POSTGRES_URL is set',
    );
  }
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
