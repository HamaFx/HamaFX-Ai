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

// Per-model cost estimation + the daily-budget guardrail.
//
// We don't try to be exact — providers shift prices and the gateway adds a
// markup we can't introspect at runtime. The numbers here are **upper bounds**
// from public list prices (Q1 2026), so the budget check stays conservative.
//
// Source of truth for the actual deployment ceiling is the env var
// `MAX_DAILY_USD`. The check fires BEFORE we invoke the model.
//
// Phase A: budget is now per-user. All functions accept `userId` and scope
// queries to the user's row in `daily_ai_spend` (composite PK: user_id, day).
//
// Phase 4: the RATES table is now the single canonical source of model
// pricing, covering every model in BYOK_PROVIDERS. The previous 8-entry
// table with a {5,15} fallback badly mis-priced models like deepseek-chat.
// The fallback is now a conservative upper bound that logs a warning.

import { getDb, schema } from '@hamafx/db';
import { sql, eq, gte, and } from 'drizzle-orm';
import { sendDirectNotification } from './alerts/delivery';

interface ModelRate {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
}

/**
 * Canonical model pricing table — single source of truth.
 *
 * Keys are in the gateway form (`provider/model-id`). The `rateKeyForModel`
 * function normalises Vertex-prefixed and bare Gemini ids to this form.
 *
 * Prices are public list prices (Q1 2026) as upper bounds. Updated in
 * Phase 4 to cover every model in BYOK_PROVIDERS so the fallback rate
 * is never used for a known model.
 */
const RATES: Record<string, ModelRate> = {
  // ── Google (Vertex + AI Gateway) ──
  'google/gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10 },
  'google/gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'google/gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'google/gemini-2.0-flash': { inputPerM: 0.1, outputPerM: 0.4 },
  'google/text-embedding-004': { inputPerM: 0.025, outputPerM: 0 },
  'google/text-embedding-005': { inputPerM: 0.025, outputPerM: 0 },

  // ── Anthropic ──
  'anthropic/claude-opus-4-1': { inputPerM: 15, outputPerM: 75 },
  'anthropic/claude-sonnet-4-5': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-sonnet-4': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-3.7-sonnet': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-haiku-4-5': { inputPerM: 0.8, outputPerM: 4 },
  'anthropic/claude-3-5-haiku-latest': { inputPerM: 0.8, outputPerM: 4 },

  // ── OpenAI ──
  'openai/gpt-4.1': { inputPerM: 3, outputPerM: 12 },
  'openai/gpt-4o': { inputPerM: 2.5, outputPerM: 10 },
  'openai/gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'openai/o4-mini': { inputPerM: 1.1, outputPerM: 4.4 },
  'openai/text-embedding-3-small': { inputPerM: 0.02, outputPerM: 0 },
  'openai/text-embedding-3-large': { inputPerM: 0.13, outputPerM: 0 },

  // ── Groq ──
  'groq/llama-3.3-70b-versatile': { inputPerM: 0.59, outputPerM: 0.79 },
  'groq/llama-3.1-8b-instant': { inputPerM: 0.05, outputPerM: 0.08 },
  'groq/llama-3.2-90b-vision-preview': { inputPerM: 0.9, outputPerM: 0.9 },
  'groq/mixtral-8x7b-32768': { inputPerM: 0.24, outputPerM: 0.24 },

  // ── Mistral ──
  'mistral/mistral-large-latest': { inputPerM: 2, outputPerM: 6 },
  'mistral/mistral-small-latest': { inputPerM: 0.2, outputPerM: 0.6 },
  'mistral/pixtral-large-latest': { inputPerM: 2, outputPerM: 6 },
  'mistral/ministral-8b-latest': { inputPerM: 0.1, outputPerM: 0.1 },
  'mistral/mistral-embed': { inputPerM: 0.1, outputPerM: 0 },

  // ── OpenRouter (passthrough pricing) ──
  'openrouter/anthropic/claude-sonnet-4-5': { inputPerM: 3, outputPerM: 15 },
  'openrouter/openai/gpt-4.1': { inputPerM: 3, outputPerM: 12 },
  'openrouter/google/gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10 },
  'openrouter/openai/gpt-4o-mini': { inputPerM: 0.15, outputPerM: 0.6 },
  'openrouter/google/gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'openrouter/meta-llama/llama-3.3-70b-instruct': { inputPerM: 0.1, outputPerM: 0.1 },
  'openrouter/openai/text-embedding-3-small': { inputPerM: 0.02, outputPerM: 0 },

  // ── xAI ──
  'xai/grok-2-latest': { inputPerM: 2, outputPerM: 10 },
  'xai/grok-2-vision-latest': { inputPerM: 2, outputPerM: 10 },
  'xai/grok-2-mini': { inputPerM: 0.2, outputPerM: 1 },

  // ── DeepSeek ──
  'deepseek/deepseek-chat': { inputPerM: 0.27, outputPerM: 1.1 },
  'deepseek/deepseek-reasoner': { inputPerM: 0.55, outputPerM: 2.19 },
  'deepseek/deepseek-coder': { inputPerM: 0.14, outputPerM: 0.28 },
};

/**
 * Conservative fallback for unknown models. Uses the most expensive
 * known rate so the budget check stays conservative. A warning is
 * logged so operators can add the missing model to RATES.
 */
const FALLBACK_RATE: ModelRate = { inputPerM: 15, outputPerM: 75 };

export const DEFAULT_TURN_ESTIMATE_USD = 0.01;

/**
 * Phase 4 — max output tokens per streamText call. Prevents a single
 * turn from generating an unbounded response that overshoots the daily
 * budget before post-stream reconciliation catches up.
 *
 * 4096 is generous for a trading assistant (most answers are 500-1500
 * tokens) but caps the worst case.
 */
export const MAX_OUTPUT_TOKENS = 4096;

/**
 * Phase 4 — per-turn input-context ceiling. Prevents a single turn on
 * a model with a very large context window (e.g. gemini-2.5-pro at 1M)
 * from consuming excessive input tokens.
 *
 * 60K tokens covers a full 60-message history + system prompt + tool
 * definitions with room to spare, while capping the worst case.
 */
export const MAX_INPUT_CONTEXT_TOKENS = 60_000;

/**
 * Normalize a streamed model id to a `RATES` key. The agent persists the
 * literal id it streamed with — which is Vertex-prefixed by default
 * (`google-vertex/gemini-2.5-flash`) — but the RATES table is keyed by the
 * gateway form (`google/gemini-2.5-flash`). Vertex and the AI Gateway bill
 * the same Google list price, so we collapse the prefix. Bare ids (no slash,
 * BYOK Google) get the `google/` prefix added.
 *
 * Phase 4: also normalises `google-vertex/` → `google/` for all Google models,
 * and handles bare model ids from other BYOK providers.
 */
function rateKeyForModel(model: string): string {
  if (model.startsWith('google-vertex/')) {
    return `google/${model.slice('google-vertex/'.length)}`;
  }
  // Bare Gemini id from BYOK google (e.g. 'gemini-2.5-flash').
  if (!model.includes('/') && model.startsWith('gemini-')) {
    return `google/${model}`;
  }
  // Bare model ids from other BYOK providers — try to infer the provider.
  if (!model.includes('/')) {
    if (model.startsWith('claude-') || model.startsWith('anthropic/')) return `anthropic/${model}`;
    if (model.startsWith('gpt-') || model.startsWith('o') || model.startsWith('text-embedding-')) return `openai/${model}`;
    if (model.startsWith('grok-')) return `xai/${model}`;
    if (model.startsWith('deepseek-')) return `deepseek/${model}`;
    if (model.startsWith('llama-') || model.startsWith('mixtral-')) return `groq/${model}`;
    if (model.startsWith('mistral-') || model.startsWith('ministral-') || model.startsWith('pixtral-')) return `mistral/${model}`;
  }
  return model;
}

/** Set of models that have been logged as missing from RATES (dedup). */
const _warnedMissingModels = new Set<string>();

/** Estimate USD cost from token counts. Always >= 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const key = rateKeyForModel(model);
  const rate = RATES[key];
  if (!rate) {
    if (!_warnedMissingModels.has(key)) {
      _warnedMissingModels.add(key);
      console.warn(`[cost] No RATES entry for model "${key}" — using fallback {${FALLBACK_RATE.inputPerM},${FALLBACK_RATE.outputPerM}}. Add it to RATES in cost.ts.`);
    }
    return (inputTokens / 1_000_000) * FALLBACK_RATE.inputPerM + (outputTokens / 1_000_000) * FALLBACK_RATE.outputPerM;
  }
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
}

/**
 * Phase 4 — model-aware per-turn cost estimate.
 * Replaces the flat $0.01 DEFAULT_TURN_ESTIMATE_USD with a conservative
 * estimate based on the model's input/output rates and assumed token counts.
 *
 * Uses a conservative upper bound: 50K input tokens + 4K output tokens,
 * which covers a typical multi-tool turn with history. For models with
 * very large context windows (e.g. gemini-2.5-pro at 1M), this prevents
 * a single oversized turn from overshooting MAX_DAILY_USD before
 * post-stream reconciliation catches up.
 */
const ESTIMATE_INPUT_TOKENS = 50_000;
const ESTIMATE_OUTPUT_TOKENS = 4_000;

export function estimateTurnCostUsd(model: string): number {
  return estimateCostUsd(model, ESTIMATE_INPUT_TOKENS, ESTIMATE_OUTPUT_TOKENS);
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Sum of `est_cost_usd` from `chat_telemetry` for the current UTC day,
 * scoped to a specific user. Returns 0 if no rows exist.
 */
export async function dailySpendUsd(userId: string, now = new Date()): Promise<number> {
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.chatTelemetry.estCostUsd}), 0)` })
    .from(schema.chatTelemetry)
    .where(
      sql`${schema.chatTelemetry.userId} = ${userId} AND ${schema.chatTelemetry.createdAt} >= ${startUtc}`,
    );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Read the authoritative running counter for today for a specific user.
 */
export async function reservedSpendUsd(userId: string, now = new Date()): Promise<number> {
  const day = utcDayKey(now);
  const rows = await getDb()
    .select({ cents: schema.dailyAiSpend.totalUsdCents })
    .from(schema.dailyAiSpend)
    .where(
      sql`${schema.dailyAiSpend.userId} = ${userId} AND ${schema.dailyAiSpend.day} = ${day}`,
    )
    .limit(1);
  return Number(rows[0]?.cents ?? 0) / 100;
}

export interface BudgetReservation {
  ok: boolean;
  spent: number;
  max: number;
}

/**
 * Atomically reserve `estimatedUsd` against today's running counter for
 * the given user. Returns `{ ok: true }` iff the reservation fits under
 * `capUsd`. Phase A: PK is now (user_id, day).
 */
export async function tryReserveBudget(
  userId: string,
  estimatedUsd: number,
  capUsd: number,
  now = new Date(),
): Promise<BudgetReservation> {
  const day = utcDayKey(now);
  const estCents = Math.max(0, Math.ceil(estimatedUsd * 100));
  const capCents = Math.max(0, Math.ceil(capUsd * 100));

  if (estCents > capCents) {
    const spent = await reservedSpendUsd(userId, now);
    return { ok: false, spent, max: capUsd };
  }

  const rows = await getDb().execute<{ total_usd_cents: number | string }>(
    sql`
      INSERT INTO daily_ai_spend (user_id, day, total_usd_cents)
      VALUES (${userId}, ${day}, ${estCents})
      ON CONFLICT (user_id, day) DO UPDATE
        SET total_usd_cents = daily_ai_spend.total_usd_cents + ${estCents}
        WHERE daily_ai_spend.total_usd_cents + ${estCents} <= ${capCents}
      RETURNING total_usd_cents
    `,
  );
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  const first = (list as Array<{ total_usd_cents: number | string }>)[0];
  if (!first) {
    const spent = await reservedSpendUsd(userId, now);
    return { ok: false, spent, max: capUsd };
  }
  return { ok: true, spent: Number(first.total_usd_cents) / 100, max: capUsd };
}

/**
 * Reconcile a previously-reserved estimate with the actual post-call cost.
 * Phase A: scoped to userId.
 */
export async function applyBudgetDelta(
  userId: string,
  deltaUsd: number,
  now = new Date(),
): Promise<void> {
  if (!Number.isFinite(deltaUsd) || deltaUsd === 0) return;
  const day = utcDayKey(now);
  const cents = Math.round(deltaUsd * 100);
  if (cents === 0) return;
  await getDb().execute(
    sql`
      INSERT INTO daily_ai_spend (user_id, day, total_usd_cents)
      VALUES (${userId}, ${day}, GREATEST(0, ${cents}))
      ON CONFLICT (user_id, day) DO UPDATE
        SET total_usd_cents = GREATEST(0, daily_ai_spend.total_usd_cents + ${cents})
    `,
  );
}

/**
 * Phase 4 — Global (tenant-wide) AI-spend ceiling.
 *
 * In addition to the per-user daily cap, this provides a safety net so
 * one user burning turns can't return 503 to everyone else. The global
 * ceiling is sourced from `MAX_GLOBAL_DAILY_USD` env var (default: 10×
 * the per-user cap). When the global spend across ALL users exceeds
 * this ceiling, new reservations are rejected for non-operator users.
 */
const GLOBAL_DAILY_USD_MULTIPLIER = 10;

export async function getGlobalDailySpend(now = new Date()): Promise<number> {
  const day = utcDayKey(now);
  const rows = await getDb()
    .select({ total: sql<number>`coalesce(sum(${schema.dailyAiSpend.totalUsdCents}), 0)` })
    .from(schema.dailyAiSpend)
    .where(sql`${schema.dailyAiSpend.day} = ${day}`);
  return Number(rows[0]?.total ?? 0) / 100;
}

export interface GlobalBudgetCheck {
  /** True iff the global spend is within the ceiling. */
  ok: boolean;
  /** Current global spend in USD. */
  globalSpent: number;
  /** The global ceiling in USD. */
  globalMax: number;
}

/**
 * Check the global daily spend ceiling. Call this before reserving
 * per-user budget. Returns `{ ok: false }` when the global ceiling
 * is exceeded.
 */
export async function checkGlobalDailyBudget(
  maxDailyUsdPerUser: number,
  now = new Date(),
): Promise<GlobalBudgetCheck> {
  const globalMax = Number(process.env.MAX_GLOBAL_DAILY_USD) || maxDailyUsdPerUser * GLOBAL_DAILY_USD_MULTIPLIER;
  const globalSpent = await getGlobalDailySpend(now);
  return {
    ok: globalSpent < globalMax,
    globalSpent,
    globalMax,
  };
}

/**
 * Throw if today's spend has already crossed `maxUsd` for the given user.
 */
export async function enforceDailyBudget(
  userId: string,
  maxUsd: number,
): Promise<{ spent: number; max: number }> {
  const spent = await reservedSpendUsd(userId);
  if (spent >= maxUsd) {
    throw new BudgetExceededError(spent, maxUsd);
  }
  return { spent, max: maxUsd };
}

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  constructor(
    readonly spent: number,
    readonly max: number,
  ) {
    super(`Daily AI budget exceeded: spent $${spent.toFixed(4)} / $${max.toFixed(2)}`);
    this.name = 'BudgetExceededError';
  }
}

export async function getMonthlySpend(userId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfMonthStr = startOfMonth.toISOString().slice(0, 10);
  const rows = await db
    .select({ totalCents: sql<number>`coalesce(sum(${schema.dailyAiSpend.totalUsdCents}), 0)` })
    .from(schema.dailyAiSpend)
    .where(
      and(
        eq(schema.dailyAiSpend.userId, userId),
        gte(schema.dailyAiSpend.day, startOfMonthStr)
      )
    );
  return (rows[0]?.totalCents ?? 0) / 100;
}

export async function getProviderMonthlySpend(userId: string, providerId: string, now = new Date()): Promise<number> {
  const db = getDb();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select({
      model: schema.chatTelemetry.model,
      estCostUsd: schema.chatTelemetry.estCostUsd,
    })
    .from(schema.chatTelemetry)
    .where(
      and(
        eq(schema.chatTelemetry.userId, userId),
        gte(schema.chatTelemetry.createdAt, startOfMonth)
      )
    );

  const KNOWN_BYOK_PROVIDERS = new Set([
    'google',
    'vertex',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
  ]);
  const providerIdFromModel = (modelId: string) => {
    const slash = modelId.indexOf('/');
    if (slash === -1) return '';
    return modelId.slice(0, slash);
  };
  const canonicalizeProviderId = (prefix: string) => {
    if (prefix === '') return 'google';
    if (prefix === 'google-vertex') return 'vertex';
    if (KNOWN_BYOK_PROVIDERS.has(prefix)) return prefix;
    return null;
  };

  let total = 0;
  for (const r of rows) {
    const rawPrefix = providerIdFromModel(r.model);
    const byokId = canonicalizeProviderId(rawPrefix);
    if (byokId === providerId) {
      total += Number(r.estCostUsd ?? 0);
    }
  }
  return total;
}

async function triggerSpendAlert(
  userId: string,
  percentage: string,
  spent: number,
  limit: number,
  config: { email?: boolean; telegram?: boolean },
) {
  const db = getDb();
  const [userRow] = await db
    .select({
      email: schema.users.email,
      alertEmail: schema.userSettings.alertEmail,
      telegramBotToken: schema.userSettings.telegramBotToken,
      telegramChatId: schema.userSettings.telegramChatId,
    })
    .from(schema.userSettings)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSettings.userId))
    .where(eq(schema.userSettings.userId, userId));

  const alertEmail = userRow?.alertEmail || userRow?.email || process.env.ALERT_TO_EMAIL;
  const telegramBotToken = userRow?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = userRow?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  const channels: ('email' | 'telegram')[] = [];
  if (config.email && alertEmail) channels.push('email');
  if (config.telegram && telegramBotToken && telegramChatId) channels.push('telegram');

  if (channels.length === 0) return;

  const subject = `[HamaFX-Ai] Monthly Budget Alert: ${percentage} Reached`;
  const body = `Your monthly AI spend has reached ${percentage} of your limit.\n\nSpent: $${spent.toFixed(2)} / $${limit.toFixed(2)}\n\n— HamaFX-Ai`;
  const alertEnv: Parameters<typeof sendDirectNotification>[2] = {};
  if (process.env.RESEND_API_KEY) alertEnv.RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (process.env.ALERT_FROM_EMAIL) alertEnv.ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
  if (alertEmail) alertEnv.ALERT_TO_EMAIL = alertEmail;
  if (telegramBotToken) alertEnv.TELEGRAM_BOT_TOKEN = telegramBotToken;
  if (telegramChatId) alertEnv.TELEGRAM_CHAT_ID = telegramChatId;

  await sendDirectNotification(
    subject,
    body,
    alertEnv,
    channels,
  );
}

async function triggerProviderAlert(
  userId: string,
  providerId: string,
  spent: number,
  limit: number,
  config: { email?: boolean; telegram?: boolean },
) {
  const db = getDb();
  const [userRow] = await db
    .select({
      email: schema.users.email,
      alertEmail: schema.userSettings.alertEmail,
      telegramBotToken: schema.userSettings.telegramBotToken,
      telegramChatId: schema.userSettings.telegramChatId,
    })
    .from(schema.userSettings)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSettings.userId))
    .where(eq(schema.userSettings.userId, userId));

  const alertEmail = userRow?.alertEmail || userRow?.email || process.env.ALERT_TO_EMAIL;
  const telegramBotToken = userRow?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = userRow?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  const channels: ('email' | 'telegram')[] = [];
  if (config.email && alertEmail) channels.push('email');
  if (config.telegram && telegramBotToken && telegramChatId) channels.push('telegram');

  if (channels.length === 0) return;

  const subject = `[HamaFX-Ai] Provider Threshold Alert: ${providerId}`;
  const body = `Your monthly spend for provider "${providerId}" has exceeded your configured threshold.\n\nSpent: $${spent.toFixed(2)} / $${limit.toFixed(2)}\n\n— HamaFX-Ai`;
  const alertEnv: Parameters<typeof sendDirectNotification>[2] = {};
  if (process.env.RESEND_API_KEY) alertEnv.RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (process.env.ALERT_FROM_EMAIL) alertEnv.ALERT_FROM_EMAIL = process.env.ALERT_FROM_EMAIL;
  if (alertEmail) alertEnv.ALERT_TO_EMAIL = alertEmail;
  if (telegramBotToken) alertEnv.TELEGRAM_BOT_TOKEN = telegramBotToken;
  if (telegramChatId) alertEnv.TELEGRAM_CHAT_ID = telegramChatId;

  await sendDirectNotification(
    subject,
    body,
    alertEnv,
    channels,
  );
}

export async function checkBudgetAlertsAndThresholds(
  userId: string,
  activeProviderId: string | null,
  now = new Date(),
): Promise<{ blocked: boolean; blockedReason?: string; nonEssentialDisabled: boolean }> {
  const db = getDb();
  const [userSettings] = await db
    .select({
      monthlyBudgetLimit: schema.userSettings.monthlyBudgetLimit,
      providerSpendingThresholds: schema.userSettings.providerSpendingThresholds,
      spendAlertsConfig: schema.userSettings.spendAlertsConfig,
      spendAlertsState: schema.userSettings.spendAlertsState,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));

  if (!userSettings) {
    return { blocked: false, nonEssentialDisabled: false };
  }

  const limit = userSettings.monthlyBudgetLimit; // in USD
  const providerThresholds = userSettings.providerSpendingThresholds ?? {};
  const alertsConfig = userSettings.spendAlertsConfig ?? {};
  const alertsState = userSettings.spendAlertsState ?? {};

  const currentMonthKey = now.toISOString().slice(0, 7);
  const isNewMonth = alertsState.monthKey !== currentMonthKey;

  const state = isNewMonth
    ? {
        monthKey: currentMonthKey,
        alerted50: false,
        alerted80: false,
        alerted100: false,
        providerAlerted: [] as string[],
      }
    : {
        monthKey: alertsState.monthKey,
        alerted50: !!alertsState.alerted50,
        alerted80: !!alertsState.alerted80,
        alerted100: !!alertsState.alerted100,
        providerAlerted: Array.isArray(alertsState.providerAlerted) ? alertsState.providerAlerted : ([] as string[]),
      };

  let stateChanged = isNewMonth;

  let nonEssentialDisabled = false;
  if (limit && limit > 0) {
    const totalSpend = await getMonthlySpend(userId, now);
    if (totalSpend >= limit) {
      if (!state.alerted100) {
        state.alerted100 = true;
        stateChanged = true;
        await triggerSpendAlert(userId, '100%', totalSpend, limit, alertsConfig);
      }
      return {
        blocked: true,
        blockedReason: `Monthly budget limit reached: $${totalSpend.toFixed(2)} / $${limit.toFixed(2)}`,
        nonEssentialDisabled: true,
      };
    }

    if (totalSpend >= limit * 0.8) {
      nonEssentialDisabled = true;
      if (!state.alerted80) {
        state.alerted80 = true;
        stateChanged = true;
        await triggerSpendAlert(userId, '80%', totalSpend, limit, alertsConfig);
      }
    } else if (totalSpend >= limit * 0.5) {
      if (!state.alerted50) {
        state.alerted50 = true;
        stateChanged = true;
        await triggerSpendAlert(userId, '50%', totalSpend, limit, alertsConfig);
      }
    }
  }

  if (activeProviderId) {
    const providerLimit = providerThresholds[activeProviderId];
    if (providerLimit && providerLimit > 0) {
      const providerSpend = await getProviderMonthlySpend(userId, activeProviderId, now);
      if (providerSpend >= providerLimit) {
        if (!state.providerAlerted.includes(activeProviderId)) {
          state.providerAlerted.push(activeProviderId);
          stateChanged = true;
          await triggerProviderAlert(userId, activeProviderId, providerSpend, providerLimit, alertsConfig);
        }
        return {
          blocked: true,
          blockedReason: `Provider "${activeProviderId}" spending limit exceeded: $${providerSpend.toFixed(2)} / $${providerLimit.toFixed(2)}`,
          nonEssentialDisabled,
        };
      }
    }
  }

  if (stateChanged) {
    await db
      .update(schema.userSettings)
      .set({ spendAlertsState: state as { monthKey?: string; alerted50?: boolean; alerted80?: boolean; alerted100?: boolean; providerAlerted?: string[]; } | null })
      .where(eq(schema.userSettings.userId, userId));
  }

  return { blocked: false, nonEssentialDisabled };
}