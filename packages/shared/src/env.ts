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
    AI_TITLE_MODEL: z.string().default('google-vertex/gemini-2.5-flash-lite'),
    AI_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
    /** Vision-capable model used by `analyze_chart_image`. */
    AI_VISION_MODEL: z.string().default('google-vertex/gemini-2.5-pro'),
    /**
     * Domain-routed models (Phase 7a). Defaults reflect the canonical
     * Vertex AI catalogue as of mid-2026:
     *   - Fundamental analysis → `gemini-2.5-pro` (deepest reasoning).
     *   - Technical analysis  → `gemini-2.5-flash` (fast structured).
     *   - News / calendar / journal summary → `gemini-2.5-flash-lite` (cheap).
     *
     * Override per-deployment via env if newer model ids become available
     * in your Vertex project / region. The router falls back to
     * AI_DEFAULT_MODEL for any domain whose env var is unset OR fails to
     * resolve at runtime.
     */
    AI_FUNDAMENTAL_MODEL: z.string().default('google-vertex/gemini-2.5-pro'),
    AI_TECHNICAL_MODEL: z.string().default('google-vertex/gemini-2.5-flash'),
    AI_SUMMARY_MODEL: z.string().default('google-vertex/gemini-2.5-flash-lite'),
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
});

// `merge()` doesn't compose ZodEffects (refines). Both DbEnv and AiEnv are
// refined, so we intersect them with the rest. `intersection()` preserves
// each branch's inferred shape and validations.
export const ServerEnvSchema = z.intersection(
  z.intersection(DbEnv, AiEnv),
  AuthEnv.merge(CacheEnv)
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
