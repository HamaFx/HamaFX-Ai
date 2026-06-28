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

// NextAuth.js v5 standard tables. Matches the @auth/drizzle-adapter schema
// so the adapter works drop-in without custom table mapping.

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ── Users ────────────────────────────────────────────────────────────────

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { withTimezone: true }),
  image: text('image'),
  /** bcrypt hash. Only set for Credentials provider users. */
  hashedPassword: text('hashedPassword'),
  /** Flat hierarchy: all users are 'user'. No admin/user distinction. */
  role: text('role').notNull().default('user'),
  /** Soft-delete support — Phase 9 cleanup plan. Null = active. */
  deletedAt: timestamp('deletedAt', { withTimezone: true }),
  /** Incremented on "sign out everywhere" to invalidate existing JWTs. */
  tokenVersion: integer('tokenVersion').notNull().default(0),
  /** TOTP secret for 2FA (encrypted at rest). */
  twoFactorSecret: text('two_factor_secret'),
  /** Whether 2FA is active. */
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

// ── User Sessions (login tracking for session management UI) ──────────────

export const userSessions = pgTable(
  'user_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceName: text('device_name'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('user_sessions_user_id_idx').on(t.userId)],
);

export type UserSessionRow = typeof userSessions.$inferSelect;
export type UserSessionInsert = typeof userSessions.$inferInsert;

// ── Accounts (OAuth links) ────────────────────────────────────────────────

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
export type AccountInsert = typeof accounts.$inferInsert;

// ── Sessions (DB-backed — only used if strategy='database') ───────────────

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;

// ── Verification Tokens (magic-link / email verification) ─────────────────

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull().unique(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.identifier, t.token] }),
  ],
);

export type VerificationTokenRow = typeof verificationTokens.$inferSelect;
export type VerificationTokenInsert = typeof verificationTokens.$inferInsert;

// ── User Settings (application-level preferences) ─────────────────────────

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Default trading symbol (e.g. 'XAUUSD'). */
  defaultSymbol: text('default_symbol').notNull().default('XAUUSD'),
  /** IANA timezone string. */
  timezone: text('timezone').notNull().default('UTC'),
  /** Locale string (BCP 47), e.g. 'en', 'zh-CN', 'ar-AE'. */
  language: text('language').notNull().default('en'),
  /** Accessibility preference. */
  reduceMotion: boolean('reduce_motion').notNull().default(false),
  /**
   * Telegram integration — per-user bot token.
   * Encrypted at rest with AES-256-GCM using ENCRYPTION_SECRET
   * (same scheme as aiApiKeys). See @hamafx/shared/encryption.
   */
  telegramBotToken: text('telegram_bot_token'),
  /** Telegram chat ID for direct messages. */
  telegramChatId: text('telegram_chat_id'),
  /** Email address for alert delivery. */
  alertEmail: text('alert_email'),
  /**
   * Encrypted JSON payload of BYOK API keys.
   * Encrypted at rest with AES-256-GCM using ENCRYPTION_SECRET.
   * Shape when decrypted: { openai?: string; anthropic?: string; google?: string }
   */
  aiApiKeys: text('ai_api_keys'),
  /**
   * Phase E — per-user per-domain default model overrides.
   * Shape (JSONB): { fundamental?: "<provider>:<modelId>",
   *                    technical?: ..., summary?: ...,
   *                    vision?: ..., embedding?: ... }
   */
  defaultModels: jsonb('default_models').$type<{
    fundamental?: string;
    technical?: string;
    summary?: string;
    vision?: string;
    embedding?: string;
  }>(),
  /**
   * Phase F — the single "default chat model" picker.
   * Shape: "<providerId>:<bareModelId>" (e.g. "google-vertex:gemini-2.5-pro").
   */
  chatModel: text('chat_model'),
  /** Phase D2 — user-pickable vision model. */
  visionModel: text('vision_model'),
  /** Phase D2 — user-pickable embedding model. */
  embeddingModel: text('embedding_model'),
  /** Fallback chain of provider IDs, e.g. ["openai", "google", "groq"] */
  aiFallbackChain: jsonb('ai_fallback_chain').$type<string[]>(),
  /** Max daily USD spend for this user. Overrides global MAX_DAILY_USD. */
  maxDailyUsd: integer('max_daily_usd'),
  /** Max monthly USD spend for this user. */
  monthlyBudgetLimit: integer('monthly_budget_limit'),
  /** Per-provider spending thresholds in USD. */
  providerSpendingThresholds: jsonb('provider_spending_thresholds').$type<Record<string, number>>(),
  /** Spend alerts channel configuration. */
  spendAlertsConfig: jsonb('spend_alerts_config').$type<{ email?: boolean; telegram?: boolean }>(),
  /** Spend alert state to prevent duplicate alerts within the same month. */
  spendAlertsState: jsonb('spend_alerts_state').$type<{
    monthKey?: string;
    alerted50?: boolean;
    alerted80?: boolean;
    alerted100?: boolean;
    providerAlerted?: string[];
  }>(),
  /** Map of providerId to last update ISO timestamp string. */
  aiApiKeysUpdatedAt: jsonb('ai_api_keys_updated_at').$type<Record<string, string>>(),
  /** Selected market data provider. */
  marketDataProvider: text('market_data_provider').notNull().default('biquote'),
  /** Theme preference: 'light', 'dark', or 'system'. */
  theme: text('theme'),
  /** Notification preferences matrix. */
  notificationPreferences: jsonb('notification_preferences'),
  /** Free-form custom instructions appended to the AI's system prompt. */
  customInstructions: text('custom_instructions'),
  /** Display time format: '12h' or '24h'. */
  timeFormat: text('time_format'),
  /** List of tool names the user has disabled. */
  disabledTools: jsonb('disabled_tools').$type<string[]>(),
  /** Whether onboarding has been completed. */
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  /**
   * Multi-Agent Orchestration — default analysis mode for new chats.
   * Values: 'single' | 'quick' | 'standard' | 'full' | 'auto'
   * 'auto' lets the orchestrator pick based on the user's message.
   */
  defaultAnalysisMode: text('default_analysis_mode').default('auto'),
  /**
   * Multi-Agent Orchestration — whether to show the expandable
   * agent opinions panel in the chat UI.
   */
  showAgentOpinions: boolean('show_agent_opinions').notNull().default(true),
  /**
   * Multi-Agent Orchestration — per-agent model overrides.
   * Shape: { technical?: string; fundamental?: string; risk?: string;
   *          sentiment?: string; decision?: string }
   * Each value is a "<providerId>:<bareModelId>" string.
   */
  agentModelOverrides: jsonb('agent_model_overrides').$type<{
    technical?: string;
    fundamental?: string;
    risk?: string;
    sentiment?: string;
    decision?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type UserSettingsInsert = typeof userSettings.$inferInsert;

// ── User Symbols (per-user watchlist) ──────────────────────────────────────

export const userSymbols = pgTable(
  'user_symbols',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Trading symbol, e.g. 'XAUUSD', 'BTCUSD'. */
    symbol: text('symbol').notNull(),
    /** Display ordering — lower numbers first. */
    displayOrder: integer('display_order').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.symbol] }),
  ],
);

export type UserSymbolRow = typeof userSymbols.$inferSelect;
export type UserSymbolInsert = typeof userSymbols.$inferInsert;
