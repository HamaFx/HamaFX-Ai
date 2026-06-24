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

import { getDb, schema } from '@hamafx/db';
import { sql, eq, gte, and } from 'drizzle-orm';
import { sendDirectNotification } from './alerts/delivery';

interface ModelRate {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
}

const RATES: Record<string, ModelRate> = {
  'openai/gpt-4.1': { inputPerM: 5, outputPerM: 15 },
  'openai/gpt-4.1-mini': { inputPerM: 0.4, outputPerM: 1.6 },
  'openai/gpt-4o': { inputPerM: 5, outputPerM: 15 },
  'anthropic/claude-3.7-sonnet': { inputPerM: 3, outputPerM: 15 },
  'anthropic/claude-sonnet-4': { inputPerM: 3, outputPerM: 15 },
  'google/gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'google/gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'google/gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10 },
};

const FALLBACK_RATE: ModelRate = { inputPerM: 5, outputPerM: 15 };

export const DEFAULT_TURN_ESTIMATE_USD = 0.01;

/**
 * Normalize a streamed model id to a `RATES` key. The agent persists the
 * literal id it streamed with — which is Vertex-prefixed by default
 * (`google-vertex/gemini-2.5-flash`) — but the RATES table is keyed by the
 * gateway form (`google/gemini-2.5-flash`). Vertex and the AI Gateway bill
 * the same Google list price, so we collapse the prefix. Bare ids (no slash,
 * BYOK Google) get the `google/` prefix added.
 */
function rateKeyForModel(model: string): string {
  if (model.startsWith('google-vertex/')) {
    return `google/${model.slice('google-vertex/'.length)}`;
  }
  // Bare Gemini id from BYOK google (e.g. 'gemini-2.5-flash').
  if (!model.includes('/') && model.startsWith('gemini-')) {
    return `google/${model}`;
  }
  return model;
}

/** Estimate USD cost from token counts. Always >= 0. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[rateKeyForModel(model)] ?? FALLBACK_RATE;
  return (inputTokens / 1_000_000) * rate.inputPerM + (outputTokens / 1_000_000) * rate.outputPerM;
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
      .set({ spendAlertsState: state as any })
      .where(eq(schema.userSettings.userId, userId));
  }

  return { blocked: false, nonEssentialDisabled };
}