# 03 — Backend & API Reference

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Cross-references:** [01-architecture.md](./01-architecture.md) · [02-data-flows.md](./02-data-flows.md) · [05-security-auth-compliance.md](./05-security-auth-compliance.md)

---

## 1. API Routes — Complete Reference

78 route files under `apps/web/src/app/api/`. All routes use Next.js App Router conventions (`route.ts` exports).

### 1.1 Auth Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/auth/[...nextauth]` | GET, POST | Public | `api/auth/[...nextauth]/route.ts` | NextAuth v5 catch-all handler |
| `/api/auth/verify-email` | GET | Public | `api/auth/verify-email/route.ts` | Email verification endpoint |
| `/api/dev/login` | GET | Dev only | `api/dev/login/route.ts` | Dev login shortcut (gated by `ENABLE_DEV_LOGIN`) |

### 1.2 Chat Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/chat` | POST | Session | `api/chat/route.ts` | Streaming chat endpoint. `runtime: 'nodejs'`, `maxDuration: 60`. Rate limited (30/min). |
| `/api/chat/threads` | GET, POST | Session | `api/chat/threads/route.ts` | List/create threads |
| `/api/chat/threads/[id]` | — | Session | `api/chat/threads/[id]/route.ts` | Get/update/delete thread |
| `/api/chat/threads/[id]/export` | — | Session | `api/chat/threads/[id]/export/route.ts` | Export thread as markdown |
| `/api/chat/threads/[id]/opinions` | — | Session | `api/chat/threads/[id]/opinions/route.ts` | Get agent committee opinions |
| `/api/chat/threads/[id]/summary` | — | Session | `api/chat/threads/[id]/summary/route.ts` | Get thread summary |
| `/api/chat/threads/bulk-delete` | — | Session | `api/chat/threads/bulk-delete/route.ts` | Bulk delete threads |
| `/api/chat/threads/fork` | — | Session | `api/chat/threads/fork/route.ts` | Fork a thread |

### 1.3 Market Data Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/market/candles` | — | Session | `api/market/candles/route.ts` | Historical OHLC candles |
| `/api/market/indicators` | — | Session | `api/market/indicators/route.ts` | Technical indicators |
| `/api/market/price` | — | Session | `api/market/price/route.ts` | Current price for symbol |
| `/api/market/search` | — | Session | `api/market/search/route.ts` | Symbol search |
| `/api/market/stream` | — | Session | `api/market/stream/route.ts` | SSE live price stream |
| `/api/market/structure` | — | Session | `api/market/structure/route.ts` | Market structure (SMC) analysis |

### 1.4 Alert Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/alerts` | — | Session | `api/alerts/route.ts` | List/create alerts |
| `/api/alerts/[id]` | — | Session | `api/alerts/[id]/route.ts` | Get/update/delete alert |
| `/api/alerts/preview` | — | Session | `api/alerts/preview/route.ts` | Preview alert evaluation |
| `/api/alerts/preview-digest` | — | Session | `api/alerts/preview-digest/route.ts` | Preview alert digest |

### 1.5 Journal Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/journal` | — | Session | `api/journal/route.ts` | List/create journal entries |
| `/api/journal/[id]` | — | Session | `api/journal/[id]/route.ts` | Get/update/delete entry |
| `/api/journal/import` | — | Session | `api/journal/import/route.ts` | Import trades |
| `/api/journal/review` | — | Session | `api/journal/review/route.ts` | AI-powered journal review |

### 1.6 Billing Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/billing/checkout` | — | Session | `api/billing/checkout/route.ts` | Create NOWPayments invoice |
| `/api/billing/portal` | — | Session | `api/billing/portal/route.ts` | Billing portal / subscription management |
| `/api/billing/webhook` | POST | HMAC-SHA512 | `api/billing/webhook/route.ts` | NOWPayments IPN webhook. Not session-auth — verified via `x-nowpayments-sig` header. |

### 1.7 Bot/Telegram Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/telegram/webhook` | GET, POST | Secret token | `api/telegram/webhook/route.ts` | Telegram webhook. Verified via `x-telegram-bot-api-secret-token` header. |
| `/api/bot/link-code` | — | Session | `api/bot/link-code/route.ts` | Generate bot linking code |
| `/api/bot/status` | — | Session | `api/bot/status/route.ts` | Check bot link status |
| `/api/bot/unlink` | — | Session | `api/bot/unlink/route.ts` | Unlink bot from account |

### 1.8 Cron Routes (12)

All cron routes are GET, authenticated via `CRON_SECRET` bearer token (`Authorization: Bearer <CRON_SECRET>`).

| Path | Source | Schedule (Vercel/VM) | Purpose |
|------|--------|---------------------|---------|
| `/api/cron/alerts` | `api/cron/alerts/route.ts` | Every 5 min (VM) | Alert evaluation + delivery |
| `/api/cron/briefings` | `api/cron/briefings/route.ts` | Every 5 min (VM) | Pre/post-event briefings |
| `/api/cron/calendar` | `api/cron/calendar/route.ts` | Every 15 min (VM) | FRED calendar ingestion |
| `/api/cron/cleanup-uploads` | `api/cron/cleanup-uploads/route.ts` | Daily (VM) | Clean up uploaded files |
| `/api/cron/cot` | `api/cron/cot/route.ts` | Friday 22:00 UTC (VM) | CFTC CoT ingestion |
| `/api/cron/embedding-backfill` | `api/cron/embedding-backfill/route.ts` | Every 6 hours (VM) | News embedding computation |
| `/api/cron/evaluate-signals` | `api/cron/evaluate-signals/route.ts` | 01:00 UTC daily (Vercel cron) | Decision signal evaluation |
| `/api/cron/fred-actuals` | `api/cron/fred-actuals/route.ts` | 01:30 UTC daily (VM) | FRED actuals backfill |
| `/api/cron/news` | `api/cron/news/route.ts` | Every 5 min (VM) | Marketaux news ingestion |
| `/api/cron/snapshots` | `api/cron/snapshots/route.ts` | 00:05 UTC daily (VM) | Daily HLOC/pivots/ATR + candles_1m prune |
| `/api/cron/warm-cache` | `api/cron/warm-cache/route.ts` | Every 2 min (VM) | Pre-fetch market data for hot paths |
| `/api/cron/weekly-review` | `api/cron/weekly-review/route.ts` | Sunday 18:00 UTC (VM) | Weekly journal review |

> **Note:** Only `/api/cron/evaluate-signals` is registered in `vercel.json` as a Vercel cron job. All others are triggered by systemd timers on the GCE VM via curl.

### 1.9 Other Routes

| Path | Methods | Auth | Source | Notes |
|------|---------|------|--------|-------|
| `/api/calendar` | — | Session | `api/calendar/route.ts` | Economic calendar |
| `/api/decision-signals` | — | Session | `api/decision-signals/route.ts` | List decision signals |
| `/api/decision-signals/[id]` | — | Session | `api/decision-signals/[id]/route.ts` | Get signal detail |
| `/api/decision-signals/[id]/feedback` | — | Session | `api/decision-signals/[id]/feedback/route.ts` | Submit signal feedback |
| `/api/decision-signals/stats` | — | Session | `api/decision-signals/stats/route.ts` | Signal statistics |
| `/api/health` | — | Public | `api/health/route.ts` | Health check (DB connectivity) |
| `/api/health/db` | — | Public | `api/health/db/route.ts` | DB-specific health check |
| `/api/me/keys` | — | Session | `api/me/keys/route.ts` | Get/set user BYOK API keys |
| `/api/news` | — | Session | `api/news/route.ts` | News feed |
| `/api/notifications/noise-config` | — | Session | `api/notifications/noise-config/route.ts` | Notification noise control settings |
| `/api/notifications/route-config` | — | Session | `api/notifications/route-config/route.ts` | Notification route settings |
| `/api/onboarding/save-progress` | — | Session | `api/onboarding/save-progress/route.ts` | Save onboarding progress |
| `/api/portfolio/positions` | — | Session | `api/portfolio/positions/route.ts` | List/create positions |
| `/api/portfolio/positions/[id]` | — | Session | `api/portfolio/positions/[id]/route.ts` | Get/update/delete position |
| `/api/portfolio/risk` | — | Session | `api/portfolio/risk/route.ts` | Portfolio risk analysis |
| `/api/portfolio/settings` | — | Session | `api/portfolio/settings/route.ts` | Portfolio settings |
| `/api/push/subscribe` | — | Session | `api/push/subscribe/route.ts` | Web push subscription |
| `/api/push/unsubscribe` | — | Session | `api/push/unsubscribe/route.ts` | Web push unsubscription |
| `/api/sentiment` | — | Session | `api/sentiment/route.ts` | Social sentiment data |
| `/api/settings/analysis-mode` | — | Session | `api/settings/analysis-mode/route.ts` | Get/set analysis mode |
| `/api/settings/bulk-test` | — | Session | `api/settings/bulk-test/route.ts` | Bulk test all API keys |
| `/api/settings/catalog` | — | Session | `api/settings/catalog/route.ts` | Symbol catalog |
| `/api/settings/chat-model` | — | Session | `api/settings/chat-model/route.ts` | Get/set chat model |
| `/api/settings/embedding-model` | — | Session | `api/settings/embedding-model/route.ts` | Get/set embedding model |
| `/api/settings/fallback-chain` | — | Session | `api/settings/fallback-chain/route.ts` | Get/set model fallback chain |
| `/api/settings/symbols` | — | Session | `api/settings/symbols/route.ts` | List user symbols |
| `/api/settings/symbols/[symbol]` | — | Session | `api/settings/symbols/[symbol]/route.ts` | Add/remove symbol |
| `/api/settings/test-market-provider` | — | Session | `api/settings/test-market-provider/route.ts` | Test market data provider |
| `/api/settings/test-provider` | — | Session | `api/settings/test-provider/route.ts` | Test AI provider |
| `/api/settings/usage-by-agent` | — | Session | `api/settings/usage-by-agent/route.ts` | AI usage by agent |
| `/api/settings/usage-by-provider` | — | Session | `api/settings/usage-by-provider/route.ts` | AI usage by provider |
| `/api/settings/vision-model` | — | Session | `api/settings/vision-model/route.ts` | Get/set vision model |
| `/api/upload` | — | Session | `api/upload/route.ts` | File upload (chart images) |
| `/api/admin/test-alert-email` | — | Session | `api/admin/test-alert-email/route.ts` | Test alert email delivery |
| `/api/admin/test-telegram` | — | Session | `api/admin/test-telegram/route.ts` | Test Telegram message delivery |

---

## 2. Auth Middleware Flow

`apps/web/src/middleware.ts` — Edge runtime, runs on every matched request.

**Execution order:**
1. **Request ID** — `readOrCreateRequestId(req)` stamps a unique ID in `x-request-id` header
2. **Legacy mode bypass** — if `AUTH_MODE=legacy` and `NODE_ENV !== 'production'`, injects `x-user-id: __system__` and passes through
3. **CSRF double-submit cookie** — for state-changing methods (POST/PUT/DELETE/PATCH) on `/api/*` (excluding `/api/auth/`):
   - Reads `hfx_csrf` cookie + `x-csrf-token` header
   - If either missing or mismatched → `403 Forbidden`
   - If cookie missing, generates new `crypto.randomUUID()` and sets it
4. **NextAuth JWT validation** — `auth()` wrapper validates session cookie, populates `req.auth.user`
5. **Authorized callback** (`auth.config.ts`) — redirects unauthenticated users to `/login` on protected routes
6. **User ID injection** — sets `x-user-id` header from JWT for downstream route handlers

**Matcher exclusions** (`middleware.ts` → `config.matcher`): `/auth`, `/share`, `/api/auth`, `/api/dev`, `/api/billing/webhook`, `/api/cron`, `/api/health`, static assets, Next.js internals.

**Route handler auth:** `apps/web/src/lib/api.ts` — `withAuth()` wrapper extracts `user.userId` from `x-user-id` header. Returns 401 if absent.

---

## 3. Shared API Patterns

### 3.1 Response Envelope

All API responses use a standardized envelope:

**Success:**
```json
{ "data": { ... } }
```

**Error:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

**Source:** `apps/web/src/lib/api.ts` — `errorResponse()`, `parseJsonBody()`, `withAuth()`

### 3.2 Rate Limiting

`packages/db/src/rate-limit.ts` — `withRateLimit(userId, endpointGroup, limit)`:
- Per-user, per-endpoint-group, per-minute rate limiting
- Stored in `rate_limits` table (or in-memory if `THROTTLE_BACKEND` unset)
- Chat endpoint: 30 turns/min (`AI_CHAT_RATE_LIMIT` env var)
- Returns `{ allowed, count, limit, retryAfter }`

### 3.3 Request Body Validation

`parseJsonBody(req, schema)` — parses JSON body and validates against Zod schema. Returns standardized error on validation failure. Body size limited by `MAX_JSON_BODY_BYTES` (default: 65536 = 64KB).

### 3.4 CSRF Protection

Double-submit cookie pattern:
- Cookie: `hfx_csrf` (SameSite=Lax, Secure in production)
- Header: `x-csrf-token` must match cookie value
- Required on all state-changing `/api/*` requests (except `/api/auth/*`)

---

## 4. Database Schema — ER Reference

46 tables across 28 schema files in `packages/db/src/schema/`. All defined with Drizzle ORM `pgTable()`.

### 4.1 ASCII Relationship Map

```
user +--< user_settings
     +--< user_sessions
     +--< user_symbols
     +--< account
     +--< session
     +--< chat_threads +--< chat_messages +--< agent_opinions
     +--< alerts
     +--< journal_entries
     +--< portfolio_positions
     +--< portfolio_settings
     +--< push_subscriptions
     +--< bot_links
     +--< memory_embeddings
     +--< daily_ai_spend
     +--< rate_limits
     +--< provider_tests
     +--< notification_noise_state
     +--< decision_signals +--< decision_signal_feedback
     |                     +--< decision_signal_outcomes
     +--< shared_snapshots
     +--< chat_telemetry
     +--< chat_tool_telemetry
     +--< audit_logs
     +--< subscriptions >-- plans
                         +--< payments
                         +--< ipn_events

organization +--< organization_member >-- user

verificationToken (standalone)
economic_events +--< briefings_emitted
news_articles +--< news_embeddings
snapshots (standalone, per-symbol)
cot_reports (standalone)
live_ticks (standalone, per-symbol)
candles_1m (standalone, per-symbol)
intermarket_resonance (standalone, per-date)
symbol_catalog (standalone reference)
cron_runs (standalone)
provider_throttle (standalone)
```

### 4.2 Table Definitions

#### `user` (auth.ts)

| Column | Type | DB Column | Notes |
|--------|------|-----------|-------|
| id | text PK | `id` | Primary key |
| name | text | `name` | Display name |
| email | text UNIQUE NOT NULL | `email` | Unique email |
| emailVerified | timestamp | `emailVerified` | Email verification timestamp |
| image | text | `image` | Avatar URL |
| hashedPassword | text | `hashedPassword` | bcrypt hash (Credentials provider only) |
| role | text NOT NULL DEFAULT 'user' | `role` | Flat hierarchy: all 'user' |
| deletedAt | timestamp | `deletedAt` | Soft-delete (null = active) |
| tokenVersion | integer | `tokenVersion` | For session invalidation |
| failedLoginAttempts | integer | `failedLoginAttempts` | Lockout counter |
| lockedUntil | timestamp | `lockedUntil` | Lockout expiry |

#### `user_settings` (auth.ts) — 32 columns

| Column | Type | Notes |
|--------|------|-------|
| userId | text FK → user.id | |
| tenantId | text | Tenant scope |
| defaultSymbol | text | Default trading symbol |
| timezone | text | User timezone |
| language | text | UI language |
| chatModel | text | Per-user chat model override |
| visionModel | text | Per-user vision model |
| embeddingModel | text | Per-user embedding model |
| fallbackChain | text[] | Model fallback chain |
| analysisMode | text | 'single'/'quick'/'standard'/'full'/'auto' |
| customInstructions | text | Custom AI instructions |
| disabledTools | text[] | Tools disabled by user |
| onboardingProgress | jsonb | Onboarding state |
| ... | | +20 more columns (preferences, notification settings, etc.) |

#### `chat_threads` (chat.ts)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | text FK → user.id | |
| title | text | Auto-generated on first turn |
| tenantId | text | Tenant scope |
| pinnedSymbol | text | Symbol pinned to thread |
| analysisMode | text | Thread analysis mode |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| deletedAt | timestamp | Soft-delete |

#### `chat_messages` (chat.ts)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| threadId | uuid FK → chat_threads.id | |
| tenantId | text | Tenant scope |
| role | text | 'user'/'assistant'/'system' |
| content | text | Message content |
| parts | jsonb | AI SDK v5 UI message parts (tool calls, tool results, etc.) |

#### `alerts` (alerts.ts)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | text FK → user.id | |
| rule | jsonb | Alert rule definition (symbol, condition, threshold) |
| tenantId | text | Tenant scope |
| channels | text | Delivery channels (email, telegram, push) |
| active | boolean | Whether alert is active |
| snoozedUntil | timestamp | Snooze expiry |

#### `journal_entries` (journal.ts) — 16 columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | text FK → user.id | |
| symbol | text | Trading symbol |
| tenantId | text | Tenant scope |
| side | text | 'long'/'short' |
| entryPrice | double precision | |
| exitPrice | double precision | |
| quantity | double precision | |
| stopLoss | double precision | |
| takeProfit | double precision | |
| entryTime | timestamp | |
| exitTime | timestamp | |
| rMultiple | real | Risk-reward multiple |
| notes | text | |
| tags | text[] | |
| createdAt | timestamp | |

#### `live_ticks` (live-ticks.ts)

| Column | Type | Notes |
|--------|------|-------|
| symbol | text PK | XAUUSD, EURUSD, GBPUSD |
| bid | double precision | |
| ask | double precision | |
| mid | double precision | (bid + ask) / 2 |
| source | text | 'biquote-signalr', 'mt5-local', 'binance-ws' |

#### `candles_1m` (candles-1m.ts)

| Column | Type | Notes |
|--------|------|-------|
| symbol | text PK | |
| o | double precision | Open |
| h | double precision | High |
| l | double precision | Low |
| c | double precision | Close |
| ts | timestamp PK | Candle timestamp |
| source | text | Data source |

#### `plans` (billing.ts)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | Plan name (Free, Pro, Enterprise) |
| nowpaymentsPlanId | text | NOWPayments plan ID |
| priceUsdCents | integer | Price in USD cents |
| payCurrency | text | Crypto payment currency |
| features | text[] | Feature keys |
| monthlyTokenCap | integer | Monthly AI token cap |
| interval | text | 'month'/'year' |

#### `subscriptions` (billing.ts)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenantId | text | Tenant scope |
| planId | uuid FK → plans.id | |
| status | subscriptionStatus | 'active'/'trialing'/'past_due'/'canceled' |
| nowpaymentsRecurringId | text | NOWPayments recurring payment ID |
| nowpaymentsInvoiceId | text | NOWPayments invoice ID |
| currentPeriodEnd | timestamp | |
| trialEnd | timestamp | |
| canceledAt | timestamp | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

#### `payments` (billing.ts) — 11 columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| subscriptionId | uuid FK → subscriptions.id | |
| tenantId | text | |
| nowpaymentsPaymentId | text | |
| nowpaymentsInvoiceId | text | |
| paymentStatus | text | |
| payAmount | real | |
| payCurrency | text | |
| priceAmount | real | |
| priceCurrency | text | |
| createdAt | timestamp | |

#### `ipn_events` (billing.ts)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| nowpaymentsPaymentId | text | |
| paymentStatus | text | |
| bodyHash | text | Hash of raw webhook body (dedup) |
| rawBody | jsonb | Full webhook payload |
| createdAt | timestamp | |
| processedAt | timestamp | When processed (null = pending) |

#### `daily_ai_spend` (daily-ai-spend.ts)

| Column | Type | Notes |
|--------|------|-------|
| userId | text | |
| tenantId | text | |
| day | date | UTC date |
| total | real | Total USD spent that day |

> Budget guard: `tryReserveBudget()` does `INSERT..ON CONFLICT (user_id, day) DO UPDATE SET total = total + candidate WHERE total + candidate <= MAX_DAILY_USD`

#### `agent_opinions` (agent-opinions.ts) — 14 columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | text | |
| threadId | uuid FK → chat_threads.id | |
| tenantId | text | |
| messageId | uuid FK → chat_messages.id | |
| agentName | text | 'economist'/'technician'/'risk_manager'/'sentiment'/'decision' |
| bias | text | 'bullish'/'bearish'/'neutral' |
| confidence | real | 0.0–1.0 |
| reasoning | text | |
| rawData | jsonb | Full agent output |
| model | text | LLM model used |
| costUsd | real | |
| latencyMs | integer | |
| analysisMode | text | |
| createdAt | timestamp | |

#### `economic_events` (calendar.ts) — 10 columns

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| title | text | Event title |
| country | text | |
| currency | text | |
| importance | text | 'low'/'medium'/'high' |
| actual | text | Actual value (null until release) |
| forecast | text | |
| previous | text | |
| releaseTime | timestamp | |
| source | text | 'fred'/'trading_economics' |

#### `news_articles` (news.ts) — 10 columns

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| title | text | |
| summary | text | |
| url | text | |
| source | text | Provider name |
| publishedAt | timestamp | |
| sentiment | real | Sentiment score (-1.0 to 1.0) |
| symbols | text[] | Related symbols |
| language | text | |
| createdAt | timestamp | Ingestion timestamp |

#### `news_embeddings` (news.ts)

| Column | Type | Notes |
|--------|------|-------|
| articleId | text FK → news_articles.id | |
| model | text | Embedding model used |
| embedding | vector(1536) | pgvector embedding (real[] in PGlite) |

#### `memory_embeddings` (memory.ts) — 9 columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| userId | text | |
| kind | text | 'journal'/'thread_summary'/'decision' |
| tenantId | text | |
| sourceId | text | ID of source entity |
| content | text | Embedded text |
| embedding | vector(1536) | pgvector (real[] in PGlite) |
| model | text | Embedding model |
| createdAt | timestamp | |

#### `decision_signals` (decision-signals.ts) — 20 columns

Key columns: id, userId, threadId, tenantId, messageId, symbol, direction, entryZone, stopLoss, takeProfit, confidence, grade, reasoning, model, costUsd, createdAt, etc.

#### `portfolio_positions` (portfolio.ts) — 13 columns

Key columns: id, userId, symbol, tenantId, direction, entryPrice, stopLoss, takeProfit, quantity, status, openedAt, closedAt, pnl.

#### `symbol_catalog` (symbol-catalog.ts) — 14 columns

Key columns: symbol, name, category, exchange, tvTicker, pipSize, lotSize, minVolume, maxVolume, isActive, displayOrder, etc.

#### Remaining tables (summary)

| Table | File | Columns | Purpose |
|-------|------|---------|---------|
| `account` | auth.ts | 11 | NextAuth OAuth account linking |
| `session` | auth.ts | 2 | NextAuth session store |
| `verificationToken` | auth.ts | 2 | NextAuth email verification tokens |
| `organization` | auth.ts | 3 | Org scaffolding (not actively used) |
| `organization_member` | auth.ts | 3 | Org member scaffolding |
| `user_sessions` | auth.ts | 5 | Custom session tracking (device, IP) |
| `user_symbols` | auth.ts | 4 | User's watchlist symbols |
| `chat_telemetry` | telemetry.ts | 12 | Per-turn telemetry (cost, latency, model) |
| `chat_tool_telemetry` | tool-telemetry.ts | 9 | Per-tool-call telemetry |
| `briefings_emitted` | briefings.ts | 5 | Briefing dedup (eventId + kind PK) |
| `cot_reports` | cot.ts | 4 | CFTC CoT report storage |
| `snapshots` | snapshots.ts | 4 | Daily HLOC/pivots/ATR per symbol |
| `shared_snapshots` | share.ts | 8 | Public shareable snapshots (HMAC-signed) |
| `push_subscriptions` | push.ts | 7 | Web push subscriptions |
| `intermarket_resonance` | intermarket-resonance.ts | 6 | Real yield, DXY, gold divergence data |
| `cron_runs` | cron-runs.ts | 3 | Cron job run log (idempotency) |
| `provider_throttle` | throttle.ts | 2 | Per-provider throttle counter |
| `provider_tests` | provider-tests.ts | 6 | User-initiated provider connection tests |
| `rate_limits` | rate-limits.ts | 4 | Per-user rate limit counters |
| `notification_noise_state` | noise-control.ts | 4 | Notification dedup state |
| `audit_logs` | audit.ts | 5 | Security audit log |

---

## 5. Migrations

42 SQL migration files in `packages/db/drizzle/` (0000–0041).

**Key migrations:**

| Migration | Purpose |
|-----------|---------|
| `0000_lazy_red_shift.sql` | Initial schema + extensions (pgcrypto, pgvector) |
| `0001_phase_1_completion.sql` | Phase 1 completion |
| `0025_multi_agent_orchestration.sql` | Multi-agent committee tables |
| `0026_decision_signal_tracking.sql` | Decision signal tracking |
| `0030_phase4_security.sql` | Security hardening |
| `0032_phase8_soft_delete_enums_fts.sql` | Soft delete, Postgres enums, FTS |
| `0035_phase3_multitenancy_foundation.sql` | Multi-tenancy foundation (tenant_id columns) |
| `0036_phase3_tenant_constraints.sql` | Tenant constraints |
| `0037_phase3_bypassrls_admin_role.sql` | BYPASSRLS admin role |
| `0038_phase3_rls_cutover.sql` | RLS policy cutover |
| `0039_phase3_runtime_fixes.sql` | Runtime fixes for RLS |
| `0040_phase8_billing_nowpayments.sql` | NOWPayments billing tables |
| `0041_fix_missing_tenant_columns.sql` | Fix missing tenant_id columns |

**PGlite compatibility:** `packages/db/src/pglite-client.ts` strips from migrations:
- `CREATE EXTENSION vector` → skipped (pgvector not available)
- `vector(N)` columns → `real[]` fallback
- `HNSW` indexes → skipped
- `CREATE POLICY` / `ALTER TABLE .. FORCE ROW LEVEL SECURITY` → skipped
- `GRANT` / `DROP POLICY` → skipped

**Migration commands:**
```bash
pnpm --filter @hamafx/db migrate:gen     # Generate from schema changes
pnpm --filter @hamafx/db migrate:apply   # Apply to DATABASE_URL
pnpm --filter @hamafx/db migrate:status  # Check migration status
pnpm --filter @hamafx/db seed:plans      # Seed billing plans
```

**Production:** `scripts/predeploy-migrate.mjs` runs automatically before Vercel build (`vercel.json` → `buildCommand`).

---

## 6. Debugging & Tracing

| Layer | Mechanism | Source |
|-------|-----------|--------|
| Diagnostic context | `AsyncLocalStorage` via `withDiagnostics()` | `packages/ai/src/diagnostics/` |
| Redaction | `redactSecrets()` / `redactString()` | `packages/ai/src/diagnostics/redact.ts` |
| Tool telemetry | `withTelemetry()` wrapper → `chat_tool_telemetry` rows | `packages/ai/src/tools/with-telemetry.ts` |
| System diagnostics | `get_system_diagnostics` tool | `packages/ai/src/tools/get-system-diagnostics.ts` |
| API error envelope | `formatErrorResponse()` | `apps/web/src/lib/api.ts` |
| Sentry | Sentry SDK (server + edge) | `apps/web/src/sentry.server.config.ts` |
| Langfuse | OpenTelemetry LLM observability | `packages/ai/src/instrumentation.ts` |
| Request ID | `x-request-id` header stamped by middleware | `apps/web/src/lib/request-id.ts` |
| Logger | Structured logger (pino-based) | `packages/shared/src/logger.ts`, `apps/web/src/lib/logger.ts` |

**`get_system_diagnostics` tool output:**
```
{ status, asOf, database, worker, budget, envCheck, narrative }
```

The agent can self-diagnose operational health via this tool, returning DB connectivity, worker status, budget remaining, and env var validation results.
