# Implementation Plan: AI Agent Multi-Tenancy

This document outlines the strategy for upgrading the HamaFX-Ai agent system from a single-user architecture to a multi-tenant, user-isolated environment. This involves refactoring the orchestrator, memory system, budget tracking, and Bring Your Own Key (BYOK) model resolution.

---

## 1. Current State

The AI agent is currently designed with single-user assumptions:
- `runChat()` in `packages/ai/src/agent.ts` (approx. 506 lines) operates without any user context.
- `RunChatArgs` has the signature: `{ threadId, userMessage, env, signal, waitUntil }`.
- **Budget**: Tracked in a global `daily_ai_spend` table, generating exactly one row per day.
- **Memory/RAG**: The `memory_embeddings` table lacks a `user_id` column, meaning all embeddings are shared.
- **Model Routing**: Hardcoded to select models based on global environment variables.
- **Tool Context**: Uses `AsyncLocalStorage` containing `{ threadId, env, signal, budget }`. All 32 tools read from this global context.
- **Committee**: Deliberation routines use hardcoded environment variable models.
- **Briefings**: Generated globally based on a single system-wide state.
- **Telegram**: Integration replies to and listens on a single global `TELEGRAM_CHAT_ID`.

---

## 2. BYOK Model Resolution

With the move to multi-tenancy, the application will no longer bear the AI inference costs. Users must provide their own API keys (Bring Your Own Key - BYOK).

- **Key Storage**: Users' AI keys will be securely stored (encrypted) in the `user_settings.ai_api_keys` JSON column.
- **Key Resolution**: On each chat turn, the system decrypts the user's keys to resolve the appropriate model provider.
  - If user has a Gemini key → use `google/` provider.
  - If user has an OpenAI key → use `openai/` provider.
  - If user has an Anthropic key → use `anthropic/` provider.
- **Fallback Chain**: The system will attempt to use the user's preferred provider, falling back to any available configured provider, and throw a user-friendly error if none exist.
- **Model Routing**: Existing logic (e.g., routing based on fundamental vs. technical domain) will be preserved but resolves against the user's available models.
- **New Utility**: Implement a `resolveUserModel(userId, domain)` function in `packages/ai/src/models.ts`.

---

## 3. runChat() Refactor

The core orchestrator must become fully user-aware.

- **Arguments Update**: Inject `userId` into `RunChatArgs`.
- **Thread Scoping**: Ensure all thread retrieval and persistence operations are scoped by `userId`.
- **Budget Verification**: Budget checks will run against the user's personal row in `daily_ai_spend`.
- **Context Injection**: Update the `AsyncLocalStorage` tool context to include the `userId`.
- **System Prompt Enrichment**: Modify the base prompt generation to inject personal details (e.g., referencing the user's name).
- **User Settings**: Load preferences (default symbol, timezone, notification channels) from `user_settings` and pass them into the agent context.

---

## 4. Per-User Budget

AI spend tracking shifts from a global daily limit to a per-user daily limit to prevent API abuse.

- **Data Structure**: `daily_ai_spend` will be keyed by `(user_id, day)` instead of just `day`.
- **Limits**: Per-user `MAX_DAILY_USD` is retrieved from `user_settings`, falling back to a global default from the environment.
- **Methods Update**: Refactor budget tracking utilities:
  - `tryReserveBudget(userId, ...)`
  - `applyBudgetDelta(userId, ...)`
- **UI Representation**: Ensure the usage page queries and displays only the active user's spend metrics.

---

## 5. Per-User Memory/RAG

Semantic search and memory recall must be strictly isolated to prevent data leaks between tenants.

- **Schema Update**: `memory_embeddings` gains a mandatory `user_id` column.
- **Vector Search**: The `search_knowledge` tool's queries must be strictly filtered by `user_id`.
- **Scoped Assets**:
  - Journal embeddings are scoped to the user.
  - Briefing embeddings are scoped to the user.
  - Thread synopses are scoped to the user.
- **Shared Assets**: News embeddings, macroeconomic data, and fundamental market events remain globally shared.

---

## 6. Per-User Tool Context

All AI tools must adapt to the new user context wrapper.

- **Context Interface**: `getToolContext()` will return an updated type:
  ```typescript
  { threadId, userId, env, signal, budget, userSettings }
  ```
- **Configuration Aware Tools**: Tools requiring notification dispatch (e.g., sending an email or Telegram message) will extract configuration directly from `userSettings` in the context.
- **Data Aware Tools**: Tools needing symbols will read directly from the user's `user_symbols` table.
- **Mutation Tools**: Tools like `set_alert` and `log_journal` must automatically inject `userId` when creating records in the database.

---

## 7. Per-User Telegram

The Telegram bot changes from a single 1:1 integration to a multiplexer.

- **Bot Configuration**: Each user stores their own `telegram_bot_token` and `telegram_chat_id` in `user_settings`.
- **Webhook Multiplexing**: The Telegram webhook endpoint routes incoming messages to the correct user thread by doing a reverse lookup on the `chat_id`.
- **Opt-In Behavior**: Users without a configured Telegram integration will simply not trigger or receive Telegram features.

---

## 8. Per-User Briefings

Automated market briefings become personalized recurring tasks.

- **Iteration Model**: The worker's briefing generator iterates over all users who possess active watchlists.
- **Personalization**: Each user receives briefings tailored only to their subscribed symbols.
- **Tracking**: The `briefings_emitted` table is updated to include a `user_id` column.
- **Budget-Aware**: The briefing engine must skip generation for users who have exhausted their `MAX_DAILY_USD` limit.

---

## 9. Committee Deliberation

The multi-model deliberation system must operate dynamically based on the keys available to the user.

- **Key Usage**: Deliberation steps must use the requesting user's BYOK credentials.
- **Graceful Degradation**: If a user does not have enough provider keys to satisfy a standard 3-model committee (e.g., they only have OpenAI), the system will gracefully degrade to running fewer parallel models or repeating models with a higher temperature for variance.

---

## 10. Files to Modify

| File Path | Planned Changes |
| --- | --- |
| `packages/ai/src/agent.ts` | Update `RunChatArgs`, refactor `runChat()` to inject user context, update thread fetch logic. |
| `packages/ai/src/context.ts` | Expand `ToolContext` interface to include `userId` and `userSettings`. |
| `packages/ai/src/models.ts` | Add credential decryption utilities and `resolveUserModel(userId, domain)`. |
| `packages/ai/src/tools/*.ts` | Update all 32 tools to extract `userId` from context and enforce RLS/scoping on queries/mutations. |
| `packages/ai/src/budget.ts` | Refactor `tryReserveBudget` and `applyBudgetDelta` signatures to require `userId`. |
| `packages/ai/src/committee.ts` | Implement dynamic model selection and graceful degradation logic based on available keys. |
| `packages/ai/src/memory.ts` | Add `userId` to embedding writes and metadata filters for vector searches. |
| `packages/worker/src/briefings.ts` | Refactor to loop over active users, verify budget, and generate tailored content. |
| `packages/worker/src/telegram.ts` | Refactor webhook routing to multiplex messages based on `chat_id` mapping to `userId`. |

*(Note: Database schema files like `packages/db/src/schema.ts` are addressed in `01-database-schema.md`)*

---

## 11. Effort Estimate & Dependencies

### Dependencies
- **01-database-schema.md**: Database modifications must be complete (especially `user_id` foreign keys and `user_settings` schema).
- **02-authentication.md**: The `userId` must be reliably injected from session context before `runChat` can be invoked securely.

### Effort Estimates

| Task | Estimated Effort |
| --- | --- |
| BYOK Model Resolution Engine | 1 Day |
| Orchestrator (`runChat`) Refactoring | 1 Day |
| Tool Context Refactoring (all 32 tools) | 2 Days |
| Budget & RAG Vector Search Scoping | 1 Day |
| Multi-tenant Telegram & Briefings Worker | 1.5 Days |
| **Total Estimated Effort** | **~6.5 Days** |
