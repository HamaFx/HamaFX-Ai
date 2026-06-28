# User Settings Split Plan

> **Status:** Planning document only — do not execute yet.
> **Created:** Phase 8 §42 of the Database Architecture Remediation Plan.

## Problem

The `user_settings` table is a "god table" — it currently holds 30+ columns
spanning multiple unrelated domains:

1. **Display preferences** — `theme`, `reduceMotion`, `timeFormat`, `language`
2. **Trading defaults** — `defaultSymbol`, `timezone`, `marketDataProvider`
3. **Telegram integration** — `telegramBotToken`, `telegramChatId`
4. **AI/LLM configuration** — `aiApiKeys`, `defaultModels`, `chatModel`,
   `visionModel`, `embeddingModel`, `aiFallbackChain`, `agentModelOverrides`
5. **Spend controls** — `maxDailyUsd`, `monthlyBudgetLimit`,
   `providerSpendingThresholds`, `spendAlertsConfig`, `spendAlertsState`
6. **Notifications** — `notificationPreferences`, `alertEmail`
7. **Onboarding** — `onboardingCompleted`, `customInstructions`,
   `disabledTools`, `defaultAnalysisMode`, `showAgentOpinions`
8. **Key rotation** — `aiApiKeysUpdatedAt`

This causes:
- Lock contention on high-traffic updates (e.g. spend alerts updating
  `spendAlertsState` while a user changes their `theme`)
- Wide rows that waste memory in the connection pool
- Unclear ownership — any feature can add a column to this table

## Proposed Split

### Table: `user_preferences`
Display and locale settings that change rarely.
- `userId` (PK, FK → user.id)
- `theme`, `reduceMotion`, `timeFormat`, `language`, `timezone`
- `defaultSymbol`, `marketDataProvider`
- `customInstructions`, `disabledTools`
- `defaultAnalysisMode`, `showAgentOpinions`
- `onboardingCompleted`
- `updatedAt`

### Table: `user_ai_config`
AI/LLM configuration — changes when user updates model picks or API keys.
- `userId` (PK, FK → user.id)
- `aiApiKeys` (encrypted)
- `aiApiKeysUpdatedAt`
- `defaultModels` (jsonb)
- `chatModel`, `visionModel`, `embeddingModel`
- `aiFallbackChain` (jsonb)
- `agentModelOverrides` (jsonb)
- `updatedAt`

### Table: `user_spend_settings`
Spend limits and alert state — updated frequently by the spend tracker.
- `userId` (PK, FK → user.id)
- `maxDailyUsd`, `monthlyBudgetLimit`
- `providerSpendingThresholds` (jsonb)
- `spendAlertsConfig` (jsonb)
- `spendAlertsState` (jsonb)
- `updatedAt`

### Table: `user_notifications`
Notification channel configuration.
- `userId` (PK, FK → user.id)
- `alertEmail`
- `telegramBotToken` (encrypted)
- `telegramChatId`
- `notificationPreferences` (jsonb)
- `updatedAt`

## Migration Strategy

1. **Create new tables** with the split schema (migration).
2. **Backfill** from `user_settings` into the new tables using a one-time
   script (`scripts/migrate-user-settings.ts`).
3. **Dual-write period** — update both `user_settings` and the new tables
   during the transition. Read from the new tables.
4. **Remove `user_settings`** once all code paths are migrated and the
   dual-write period has been stable for one release cycle.

## Considerations

- The `user_settings` table is read on every authenticated request via
  the session callback. Splitting it means the session callback needs to
  join or multi-query. Consider caching the most-read fields
  (`theme`, `language`, `defaultSymbol`) in the JWT itself.
- The `aiApiKeys` encryption is already handled by `@hamafx/shared/encryption`.
  The split does not change the encryption scheme.
- Spend alert state (`spendAlertsState`) is updated by a cron job, not by
  the user. Moving it to its own table eliminates the most common source
  of write contention.

## Timeline

This is a future refactor. Do not execute until:
- All Phase 1–8 remediation tasks are complete and stable
- The team has reviewed this plan
- A migration script has been written and tested on a staging database