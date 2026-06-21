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
//
// Design decisions:
//   - `users.id` is `text` (not `uuid`) because NextAuth generates
//     its own IDs via `crypto.randomUUID()` passed through the adapter.
//   - Passwords are stored hashed (bcrypt) in `hashedPassword` — only
//     populated for Credentials provider users. OAuth users leave it null.
//   - `role` defaults to `'user'` per the flat-hierarchy decision.
//   - `accounts` compound PK on `(provider, providerAccountId)` is the
//     NextAuth convention — one account per provider per user.

import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ── Users ───────────────────────────────────────────────────────────

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
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

// ── Accounts (OAuth links) ──────────────────────────────────────────

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
  (t) => ({
    compoundKey: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export type AccountRow = typeof accounts.$inferSelect;
export type AccountInsert = typeof accounts.$inferInsert;

// ── Sessions (DB-backed — only used if strategy='database') ────────

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;

// ── Verification Tokens (magic-link / email verification) ──────────

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull().unique(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => ({
    compoundKey: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

export type VerificationTokenRow = typeof verificationTokens.$inferSelect;
export type VerificationTokenInsert = typeof verificationTokens.$inferInsert;

// ── User Settings (application-level preferences) ──────────────────

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Default trading symbol (e.g. 'XAUUSD'). */
  defaultSymbol: text('default_symbol').notNull().default('XAUUSD'),
  /** IANA timezone string. */
  timezone: text('timezone').notNull().default('UTC'),
  /** Locale string, e.g. 'en', 'zh'. */
  language: text('language').notNull().default('en'),
  /** Accessibility preference. */
  reduceMotion: boolean('reduce_motion').notNull().default(false),
  /** Telegram integration — per-user bot token. */
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
   * The resolver checks this before falling back to the provider
   * spec defaults in BYOK_PROVIDERS.defaultModels.
   *
   * Phase F — superseded by `chat_model` (single-string default) for
   * the main chat surface. Kept for the convene-committee tool which
   * calls `resolveUserModel` per role. Will be dropped once the
   * committee path moves to `resolveChatModel` too.
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
   * Nullable; when null the resolver falls back to the provider's
   * spec.defaultModels.technical of the highest-priority configured
   * provider (PROVIDER_PRIORITY in packages/ai/src/model.ts).
   *
   * This is the canonical per-user model choice. The pre-F multi-domain
   * `defaultModels` JSONB column above is retained only because
   * convene-committee still consumes it for its per-role picks.
   */
  chatModel: text('chat_model'),
  /**
   * Phase D2 — user-pickable vision model for the
   * `analyze_chart_image` tool. Same shape as `chatModel`:
   * `"<providerId>:<bareModelId>"` (e.g. `"google-vertex:gemini-2.5-pro"`).
   * Nullable; when null the resolver falls back to the user's chat
   * provider's `spec.defaultModels.vision`, then to env.AI_VISION_MODEL
   * (operator-set platform default), then to the hardcoded default.
   */
  visionModel: text('vision_model'),
  /**
   * Phase D2 — user-pickable embedding model for RAG / memory / news
   * embeddings. Same shape as `chatModel`. Nullable; when null the
   * resolver falls back to env.AI_EMBEDDING_MODEL (operator-set; the
   * platform default is `openai/text-embedding-3-small`), then to
   * the user's chat provider's `spec.defaultModels.embedding`.
   */
  embeddingModel: text('embedding_model'),
  /** Max daily USD spend for this user. Overrides global MAX_DAILY_USD. */
  maxDailyUsd: integer('max_daily_usd'),
  /** Whether onboarding has been completed. */
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type UserSettingsInsert = typeof userSettings.$inferInsert;

// ── User Symbols (per-user watchlist) ───────────────────────────────

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
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.symbol] }),
  }),
);

export type UserSymbolRow = typeof userSymbols.$inferSelect;
export type UserSymbolInsert = typeof userSymbols.$inferInsert;