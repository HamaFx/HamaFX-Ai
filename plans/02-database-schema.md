# Database Schema Migration Plan

This document outlines the database schema transformations required to migrate HamaFX-Ai from a single-user personal trading copilot into a multi-user open-source platform.

## 1. Current State

The current database consists of 20 tables with no concept of users or multi-tenancy. All data is assumed to belong to a single global user. 

**Tables needing a `user_id` column:**
- `chat_threads` (uuid PK, title, pinned_symbol, model_override, etc.)
- `alerts` (uuid PK, rule JSONB, channels, note, active, fired_at)
- `journal_entries` (uuid PK, symbol, side, entry, stop, target, etc.)
- `push_subscriptions` (uuid PK, endpoint, p256dh, auth, user_agent)
- `daily_ai_spend` (date PK, total_usd_cents) - currently ONE row per day globally
- `shared_snapshots` (uuid PK, title, body, overlay, symbol, tf)
- `memory_embeddings` (uuid PK, kind, source_id, symbol, text, embedding)
- `chat_telemetry` (uuid PK, thread_id, message_id, model, tokens, cost)
- `chat_tool_telemetry` (uuid PK, thread_id, message_id, tool, ms, ok)
- `briefings_emitted` (composite PK event_id+kind, message_id FK)

**Tables that stay shared (no `user_id` needed):**
- `live_ticks` (symbol PK) - shared market data
- `candles_1m` (symbol+t composite PK) - shared market data
- `news_articles` - shared news cache
- `news_embeddings` - shared news vectors
- `economic_events` - shared calendar
- `snapshots` - shared market snapshots
- `cot_reports` - shared CFTC data
- `intermarket_resonance` - shared macro data
- `provider_throttle` - infrastructure

## 2. New Tables

We will introduce the standard NextAuth.js tables via the Auth.js Drizzle Adapter, alongside custom tables for user preferences and watchlists.

- `users` (Auth.js core identity table)
- `accounts` (Auth.js OAuth links)
- `sessions` (Auth.js active sessions)
- `verification_tokens` (Auth.js magic link/email verification)
- `user_settings` (Per-user preferences, BYOK keys, notification config, etc.)
- `user_symbols` (Per-user watchlist - allowing unlimited instruments)

## 3. Schema Changes (Drizzle)

For every table that requires multi-tenancy, we will add a `userId` column with a foreign key referencing the `users` table and a cascading delete policy.

Example implementation in Drizzle ORM:

```typescript
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users'; // Standard Auth.js users table

// Example: Modifying chat_threads
export const chatThreads = pgTable('chat_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  pinnedSymbol: text('pinned_symbol'),
  modelOverride: text('model_override'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

All existing isolated tables will receive the following definition for `userId`:
```typescript
userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
```

## 4. daily_ai_spend Redesign

Currently, AI spend is tracked on a global daily basis. We need to restructure this to track daily limits on a per-user basis.

- **Composite Primary Key:** The primary key will become a composite of `(user_id, day)`.
- **Per-User Budgets:** Each user can define their `MAX_DAILY_USD` inside `user_settings`.

```typescript
import { pgTable, text, date, integer, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';

export const dailyAiSpend = pgTable('daily_ai_spend', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  totalUsdCents: integer('total_usd_cents').notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.day] })
}));
```

## 5. Migration Strategy

To ensure zero-downtime and local PGlite compatibility, the database migration will be performed in three steps:

1. **Drizzle Migration Generation:**
   Use `drizzle-kit generate` to create SQL migration files applying the new tables and altering the existing ones. Initially, `user_id` on existing tables may need to be nullable or populated with a default script before enforcing `NOT NULL`.

2. **Data Migration Script:**
   - Create a single "default" user in the `users` table.
   - Run an `UPDATE` query assigning all existing records (chat threads, journals, etc.) to this default user's ID.
   - Enforce the `NOT NULL` constraint and setup foreign keys.

3. **Backward Compatibility:**
   Drizzle migrations are fully compatible with PGlite. The Next.js API routes or server actions will automatically provision the default user in single-user setups if a specific environment variable flags "local mode".

## 6. Row-Level Security (RLS)

- **Recommendation:** Application-level filtering via Drizzle ORM.
- **Why?** Drizzle's architecture operates efficiently with explicit `.where()` conditions. Application-level filtering ensures we maintain broad database compatibility (including PGlite which is critical for local development) without relying on complex PostgreSQL-specific RLS policies.

**Query Pattern:**
All queries fetching tenant data will universally inject `.where(eq(table.userId, ctx.userId))`.

**Helper Approach:**
```typescript
// Shared utility for queries
export const withUserScope = (userId: string) => {
  return eq(chatThreads.userId, userId);
};

// Usage
const threads = await db.query.chatThreads.findMany({
  where: withUserScope(session.user.id)
});
```

## 7. user_symbols Table Design

Since instruments are now unlimited, we need a way for users to define their individual watchlists.

```typescript
export const userSymbols = pgTable('user_symbols', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.symbol] })
}));
```

- **Default Watchlist:** Upon registration, new users will have a default watchlist populated: `XAUUSD`, `EURUSD`, `GBPUSD`.
- **Worker Pub/Sub:** The background worker daemon will query the `UNION` of all distinct `user_symbols.symbol` values to determine which live market ticks to subscribe to from providers.

## 8. Indexes

To prevent sequential scans on tenant tables, we need `userId` indexes. Drizzle definitions will be updated with:

- `chat_threads`: `index('idx_chat_threads_user_id').on(table.userId)`
- `alerts`: `index('idx_alerts_user_id').on(table.userId)`
- `journal_entries`: `index('idx_journal_user_id').on(table.userId)`
- `push_subscriptions`: `index('idx_push_user_id').on(table.userId)`
- `shared_snapshots`: `index('idx_shared_snapshots_user_id').on(table.userId)`
- `memory_embeddings`: `index('idx_memory_user_id').on(table.userId)`
- `chat_telemetry`: `index('idx_chat_telemetry_user_id').on(table.userId)`
- `chat_tool_telemetry`: `index('idx_tool_telemetry_user_id').on(table.userId)`
- `briefings_emitted`: `index('idx_briefings_user_id').on(table.userId)`

**Composite Indexes:**
- `alerts(userId, active)` for fetching active alerts per user quickly.
- `chat_threads(userId, createdAt)` for rapid dashboard rendering.

## 9. Effort Estimate & Dependencies

**Effort Estimate:**
- Schema rewriting & NextAuth definitions: 2 hours
- Default user data migration script: 1 hour
- Repointing all existing queries with `userId` scope: 4-5 hours
- Worker `user_symbols` UNION subscription refactoring: 2 hours
- Total Estimated Time: ~10 hours

**Dependencies:**
- **01-authentication-and-auth.md** (NextAuth Setup must be conceptualized first)
- Depends on the creation of Next.js user session retrieval context (e.g., `await auth()` helper) to provide the `userId` for queries.
