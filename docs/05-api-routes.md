# 05 — API Routes

> Comprehensive reference for all 93 API routes, auth flow, middleware,
> CSRF hardening, cron pipelines, and shared patterns. Last updated: Phase L.
>
> **Note:** This document describes all route files under `apps/web/src/app/api/`.
> The route tree was last verified against commit `1803c17` (main).

---

## Table of Contents

1. [Auth Flow & Middleware](#1-auth-flow--middleware)
2. [Shared Patterns](#2-shared-patterns)
3. [Auth Routes](#3-auth-routes)
4. [Chat Routes](#4-chat-routes)
5. [Market Data Routes](#5-market-data-routes)
6. [Alert Routes](#6-alert-routes)
7. [Journal Routes](#7-journal-routes)
8. [Push Notification Routes](#8-push-notification-routes)
9. [Upload Route](#9-upload-route)
10. [Settings Routes](#10-settings-routes)
11. [Admin Routes](#11-admin-routes)
12. [Billing Routes](#12-billing-routes)
13. [Bot Routes](#13-bot-routes)
14. [Decision Signals Routes](#14-decision-signals-routes)
15. [Portfolio Routes](#15-portfolio-routes)
16. [Notification Routes](#16-notification-routes)
17. [Telegram Routes](#17-telegram-routes)
18. [Health Routes](#18-health-routes)
19. [Cron Routes](#19-cron-routes)
20. [Runtime Split](#20-runtime-split)
21. [Response Envelope Reference](#21-response-envelope-reference)

---

## 1. Auth Flow & Middleware

### 1.1 Overview

Multi-tenant authentication managed by **NextAuth.js v5** (Auth.js). Uses a Credentials provider (email + password with bcrypt). Sessions are JWT-based (stateless) and stored in HttpOnly cookies. Every subsequent request is gated by Edge middleware that validates the NextAuth JWT.

### 1.2 Middleware (src/middleware.ts)

- **Runtime**: Edge (Web Crypto only — no Node APIs, no `postgres-js`).
- **Session check**: Reads NextAuth JWT session cookie. If invalid or missing, redirects to `/login` with a
  `next` query param pointing back to the original URL.
- **CSRF**: Double-submit cookie pattern. A `hfx_csrf` cookie (random UUID)
  is minted if absent and echoed on every response. State-changing requests
  (`POST`, `PUT`, `DELETE`, `PATCH`) under `/api/*` must carry an
  `X-CSRF-Token` header matching the cookie value, or they get a `403
  Forbidden`.
- **Request ID**: Every request gets an `X-Request-Id` header
  (honoured from upstream if present, otherwise a fresh UUID v4). Echoed on
  the response and embedded in error bodies so the UI can show it in bug
  reports.
- **Exemptions** (no auth cookie required):

  | Path pattern        | Rationale                                   |
  |---------------------|---------------------------------------------|
  | `/login`            | The login surface itself                    |
  | `/register`         | Registration page                           |
  | `/forgot-password`  | Password reset request                      |
  | `/reset-password`   | Password reset form                         |
  | `/api/auth/*`       | Login + logout + verify-email handlers      |
  | `/api/cron/*`       | Cron-secret-protected internally            |
  | `/api/telegram/*`   | Telegram webhook (secret-token protected)   |
  | `/api/dev/*`        | Dev-only login bypass                       |
  | `/api/billing/webhook` | HMAC-signed, not session-auth           |
  | `/share/*`          | Public share pages                          |
  | `_next/*`, static   | Next.js internals, favicon, manifest, icons |

### 1.3 NextAuth Configuration

- Defined in `apps/web/src/auth.ts`.
- Uses Drizzle adapter to persist users and sessions.
- Exposes `session.user.id` to API routes for multi-tenant data isolation.
- Cookie flags: `Path=/; HttpOnly; SameSite=Lax; Secure` (Secure only in production).

### 1.4 CSRF Double-Submit Detail

- Cookie: `hfx_csrf` — a random UUID v4, `SameSite=Lax`, `Path=/`.
- Header: `X-Csrf-Token` — must match the cookie value exactly for any
  state-changing route under `/api/*`.
- Exempt from CSRF check: `GET` / `HEAD` / `OPTIONS` and any path outside
  `/api/*` (including `/api/cron/*` which is excluded by the matcher).
- The `SameSite=Lax` attribute on the auth cookie already blocks cross-site
  form posts — the CSRF token is a belt-and-braces defense.

---

## 2. Shared Patterns

### 2.1 `errorResponse(err, req?)` — `/lib/api.ts`

Standardised JSON error envelope for every route. Maps different error
types to appropriate HTTP status codes:

| Error class        | HTTP status | `code` field          |
|--------------------|-------------|-----------------------|
| `AppError`         | `err.status`| `err.code`            |
| `ProviderError`    | Converted to `AppError` via `toAppError()` |
| `ZodError`         | 400         | `"VALIDATION"`        |
| Anything else      | 500         | `"INTERNAL"`          |

Response shape:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Invalid request",
    "details": { ... },
    "requestId": "uuid-if-present"
  }
}
```

If `req` is passed and carries `X-Request-Id`, the header is echoed on the
response and the id is embedded in the error body.

### 2.2 `parseJsonBody(req, schema)` — `/lib/api.ts`

- Wraps `req.json()` with Zod validation.
- Hard cap on body size: defaults to 6 MiB (`MAX_JSON_BODY_BYTES` env
  override).
- Streams the body with a byte-count guard — stops early if the client
  exceeds the cap, without buffering the entire payload.
- Pre-checks the `Content-Length` header to bail early.
- Throws `validationError` on oversized payload or invalid JSON.
- Returns the parsed, validated Zod output.

### 2.3 `parseSearchParams(req, schema)` — `/lib/api.ts`

- Extracts `URLSearchParams` from the request URL, passes through a Zod
  schema (which handles `z.coerce`, defaults, etc.).
- Used by `GET` endpoints with query parameters (e.g. candles, price).

### 2.4 `withCronAuth(req, fn)` — `/lib/cron.ts`

Single auth gate for all `/api/cron/*` handlers. Accepts two credential
flavours:

1. **Bearer token** — `Authorization: Bearer <CRON_SECRET>`. Used by
   systemd timers on the GCE VM and Vercel cron scheduler. Constant-time
   compare via `timingSafeEqual()`.

2. **Session cookie** — the NextAuth session cookie. Lets the operator
   hand-trigger a cron from the admin dashboard without pasting
   `CRON_SECRET` into the client.

Returns `401` if neither path authenticates. On handler success wraps the
returned `{ processed, note? }` in `{ ok: true, processed, note? }`. On
handler throw returns `{ error: { code: "INTERNAL", message } }` with
status 500.

### 2.5 `getAuthEnv()` vs `getServerEnv()` — `/lib/env.ts`

| Function        | Scope                         | Where safe                 |
|-----------------|-------------------------------|----------------------------|
| `getAuthEnv()`  | `NEXTAUTH_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` | Edge middleware + Node routes |
| `getServerEnv()`| Full `ServerEnv` (AI keys, DB URL, provider keys, etc.) | Node routes only          |

Both are lazily cached — validation runs on first call, cached thereafter.

---

## 3. Auth Routes

### `GET/POST /api/auth/*`

Managed entirely by NextAuth.js. Handles provider sign-in, callbacks, and session retrieval.

**Runtime**: nodejs

**Response**: Varies by NextAuth endpoint (e.g., `200 OK` for session, `302 Found` for redirects).

---

## 4. Chat Routes

### `POST /api/chat`

Streaming chat endpoint. Uses Vercel AI SDK v5, `runChat()`, returns an SSE
stream of UI messages.

**Runtime**: nodejs

| Field            | Type                     | Required | Notes                                       |
|------------------|--------------------------|----------|---------------------------------------------|
| `threadId`       | string (UUID)            | Yes      | Must be an existing thread                  |
| `modelOverride`  | string (1–120) \| null   | No       | One-shot model override for this turn only  |
| `messages`       | UIMessage[]              | Yes      | Min 1 message; last must have `role: "user"` |

**Headers**:

- `X-AI-Prefs` (optional): JSON object with optional `fundamentalModel`,
  `technicalModel`, `summaryModel`, `customInstructions`. Overrides the
  server's per-domain model routing for this turn.

**Response**: SSE stream (`text/event-stream`) of AI SDK UI messages. On
error returns standard JSON error envelope. Special case:
`BudgetExceededError` → `{ error: { code: "BUDGET_EXCEEDED", … } }`.

### `GET /api/chat/threads`

List all chat threads, newest first.

**Runtime**: nodejs

**Response**: `200 { "threads": [ … ] }`

### `POST /api/chat/threads`

Create a new (empty) chat thread.

**Runtime**: nodejs

| Field           | Type                       | Required |
|-----------------|----------------------------|----------|
| `pinnedSymbol`  | `"XAUUSD"`\|`"EURUSD"`\|`"GBPUSD"` \| null | No |

**Response**: `201 { "thread": { … } }`

### `GET /api/chat/threads/[id]`

Fetch a single thread with its messages.

**Runtime**: nodejs

**Query params**:

| Param    | Value    | Effect                                           |
|----------|----------|--------------------------------------------------|
| `fields` | `thread` | Skinny shape — returns only the thread row, no messages. Used for sidebar title poll-refreshes. |

**Response (full)**: `200 { "thread": { … }, "messages": [ … ] }`
**Response (skinny)**: `200 { "thread": { … } }`
**Response (not found)**: `404 { "error": { "code": "NOT_FOUND", … } }`

### `DELETE /api/chat/threads/[id]`

Delete a thread and all its messages.

**Runtime**: nodejs

**Response**: `200 { "ok": true }`

---

## 5. Market Data Routes

### `GET /api/market/price`

Latest mid-prices. Browser polls every 1.5 s; data layer caches at 3 s.

**Runtime**: nodejs

**Query params**:

| Param    | Type   | Notes                                                        |
|----------|--------|--------------------------------------------------------------|
| `symbol` | Symbol | Repeated or comma-separated. Default: all three symbols.     |

**Response**:

```json
{
  "ticks": [
    {
      "symbol": "XAUUSD",
      "bid": 2401.23,
      "ask": 2401.83,
      "timestamp": 1718740000000,
      "stale": false,
      "producedAt": 1718740000123,
      "ageMs": 45
    }
  ],
  "anyStale": false
}
```

- `stale`: true when the data layer served a stale-while-error fallback value.
- `ageMs`: milliseconds since the worker observed the tick (null for REST
  fallbacks; >5000 means "don't quote as live").
- CDN cache: `max-age=0, s-maxage=3, stale-while-revalidate=15`.

### `GET /api/market/candles`

OHLC candle window.

**Runtime**: nodejs

| Param    | Type         | Default | Notes                           |
|----------|--------------|---------|----------------------------------|
| `symbol` | Symbol       | —       | Required                        |
| `tf`     | Timeframe    | `"1h"`  | `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w` |
| `count`  | int (1–5000) | 300     | Number of bars                  |

**Response**:

```json
{
  "symbol": "XAUUSD",
  "tf": "1h",
  "candles": [ { "timestamp": …, "open": …, "high": …, "low": …, "close": … } ],
  "stale": false,
  "producedAt": 1718740000123
}
```

CDN cache: depends on timeframe — 5 s for `1m`, 30 s for all others;
`stale-while-revalidate=300`.

### `POST /api/market/indicators`

Compute multiple technical indicators against a single candle window (one
round-trip for "EMA 20 + EMA 50 + RSI 14").

**Runtime**: nodejs

| Field        | Type                  | Required | Notes                         |
|--------------|-----------------------|----------|-------------------------------|
| `symbol`     | Symbol                | Yes      |                               |
| `tf`         | Timeframe             | No       | Default: `"1h"`               |
| `count`      | int (1–5000)          | No       | Default: 300                  |
| `indicators` | `{ kind, params? }[]` | Yes      | 1–10 entries. See `@hamafx/shared` for available kinds (SMA, EMA, RSI, MACD, ATR, Bollinger, etc.) |

**Response**:

```json
{
  "symbol": "XAUUSD",
  "tf": "1h",
  "count": 300,
  "candles": [ … ],
  "results": [ { "kind": "EMA", "params": { "period": 20 }, "values": [ … ] } ]
}
```

### `POST /api/market/structure`

Smart Money Concepts (SMC) structure computation — swings, BOS/CHoCH, FVG,
order blocks, liquidity sweeps.

**Runtime**: nodejs

| Field     | Type                  | Required | Notes                                   |
|-----------|-----------------------|----------|-----------------------------------------|
| `symbol`  | Symbol                | Yes      |                                         |
| `tf`      | Timeframe             | No       | Default: `"1h"`                         |
| `count`   | int (20–2000)         | No       | Default: 300                            |
| `kinds`   | StructureKind[]       | No       | Subset of: `swings`, `bos-choch`, `fvg`, `order-block`, `liquidity`. Default: all |
| `lookback`| int (1–20)            | No       | Swing lookback `k`. Default: 3          |

**Response**: Sparse structure event envelope — see
`packages/shared/src/schemas/structure.ts`.

---

## 6. Alert Routes

### `GET /api/alerts`

List all alerts.

**Runtime**: nodejs

| Query param | Value | Effect                              |
|-------------|-------|-------------------------------------|
| `active`    | `1`   | Filter to only `active = true` rows |

**Response**: `200 { "alerts": [ … ] }`

### `POST /api/alerts`

Create a new alert.

**Runtime**: nodejs

| Field      | Type              | Required | Notes                             |
|------------|-------------------|----------|-----------------------------------|
| `rule`     | AlertRule         | Yes      | See `AlertRuleSchema`             |
| `channels` | AlertChannel[]    | No       | Default: `["email"]`              |
| `note`     | string (max 280)  | No       |                                   |

**Response**: `201 { "alert": { … } }`

### `GET /api/alerts/[id]`

Get a single alert.

**Runtime**: nodejs

**Response**: `200 { "alert": { … } }` or `404`.

### `PATCH /api/alerts/[id]`

Update an alert. All fields optional.

**Runtime**: nodejs

| Field      | Type                        | Notes                                   |
|------------|-----------------------------|-----------------------------------------|
| `rule`     | AlertRule                   |                                         |
| `channels` | AlertChannel[]              |                                         |
| `note`     | string \| null              |                                         |
| `active`   | boolean                     |                                         |
| `firedAt`  | int (epoch ms) \| null      | Pass `null` to re-arm a fired alert.    |

**Response**: `200 { "alert": { … } }` or `404`.

### `DELETE /api/alerts/[id]`

Delete an alert.

**Runtime**: nodejs

**Response**: `200 { "ok": true }`

---

## 7. Journal Routes

### `GET /api/journal`

List journal entries + aggregate stats.

**Runtime**: nodejs

| Query param | Value  | Effect                              |
|-------------|--------|-------------------------------------|
| `symbol`    | Symbol | Filter entries by symbol            |

**Response**: `200 { "entries": [ … ], "stats": { … } }`

### `POST /api/journal`

Create a new journal entry.

**Runtime**: nodejs

| Field      | Type              | Required | Notes                       |
|------------|-------------------|----------|-----------------------------|
| `symbol`   | Symbol            | Yes      |                             |
| `side`     | TradeSide         | Yes      | `"long"` \| `"short"`       |
| `openedAt` | int (epoch ms)    | Yes      |                             |
| `entry`    | number            | Yes      | Entry price                 |
| `stop`     | number \| null    | No       | Stop-loss level             |
| `target`   | number \| null    | No       | Take-profit level           |
| `size`     | number \| null    | No       | Position size               |
| `notes`    | string \| null    | No       | Max 2000 chars              |
| `tags`     | string[] (max 40) | No       | Max 10 tags                 |

**Response**: `201 { "entry": { … } }`

### `GET /api/journal/[id]`

Get a single journal entry.

**Response**: `200 { "entry": { … } }` or `404`.

### `PATCH /api/journal/[id]`

Update (close, edit) a journal entry.

**Runtime**: nodejs

| Field      | Type              | Notes                         |
|------------|-------------------|-------------------------------|
| `closedAt` | int \| null       | Epoch ms; set to close        |
| `exit`     | number \| null    | Exit price                    |
| `stop`     | number \| null    |                               |
| `target`   | number \| null    |                               |
| `size`     | number \| null    |                               |
| `outcome`  | TradeOutcome      | `"win"` \| `"loss"` \| `"breakeven"` |
| `notes`    | string \| null    |                               |
| `tags`     | string[]          |                               |

**Response**: `200 { "entry": { … } }` or `404`.

### `DELETE /api/journal/[id]`

Delete a journal entry.

**Response**: `200 { "ok": true }`

---

## 8. Push Notification Routes

### `POST /api/push/subscribe`

Persist a browser `PushSubscription`. Idempotent on `endpoint`
(re-subscribing overwrites `p256dh`/`auth`).

**Runtime**: nodejs

**Auth**: Defense-in-depth recheck of NextAuth JWT (middleware already
gates this, but push endpoints get extra paranoia). Requires `VAPID_PUBLIC_KEY`
and `VAPID_PRIVATE_KEY` env vars.

| Field      | Type   | Required |
|------------|--------|----------|
| `endpoint` | URL    | Yes      |
| `keys`     | object | Yes      |
| `keys.p256dh` | string | Yes   |
| `keys.auth`   | string | Yes   |

**Responses**:

| Status | Body                                        |
|--------|---------------------------------------------|
| 200    | `{ "id": "<uuid>" }`                        |
| 400    | `{ "error": "invalid_body", "issues": […] }` |
| 401    | `{ "error": "unauthorized" }`               |
| 503    | `{ "missing": ["VAPID_PUBLIC_KEY", …] }`    |

### `POST /api/push/unsubscribe`

Delete a push subscription by `endpoint`. Idempotent — always returns 200
even if the row was already gone.

**Runtime**: nodejs

| Field      | Type | Required |
|------------|------|----------|
| `endpoint` | URL  | Yes      |

**Response**: `200 { "ok": true }`

---

## 9. Upload Route

### `POST /api/upload`

Chat-attachment image upload to Supabase Storage. Multipart form upload
(not JSON) — keeps chat request bodies small (<50 KB) instead of shipping
base64-encoded images (~27 MB).

**Runtime**: nodejs

**Limits**:

- Max file size: 5 MB (`CHAT_IMAGE_MAX_BYTES`).
- Total request body: 5 MB + 1 KB headroom.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
  `image/heic`, `image/heif`.

| Form field | Type | Required | Notes                |
|------------|------|----------|----------------------|
| `file`     | File | Yes      | The image to upload  |

**Response**: `200`

```json
{
  "url": "https://…/chat-images/2025-06-18/abc123-photo.jpg",
  "path": "2025-06-18/abc123-photo.jpg",
  "mediaType": "image/jpeg",
  "uploadedAt": "2025-06-18T12:00:00.000Z"
}
```

**Requires**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Returns 503 if
not configured.

---

## 10. Settings Routes

### `GET /api/settings/catalog`

Returns the full model catalog: supported providers, per-domain defaults, model lists, and capabilities.

**Runtime**: nodejs

**Auth**: Authenticated user (via `withAuth()`)

**Response**: `200 { "domains": [...], "providers": [...], "total": N, "totalModels": N }` — See `CatalogResponse` in `packages/shared/src/byok.ts`.

### `GET /api/me/keys` / `POST /api/me/keys`

Get or set the user's encrypted BYOK API keys.

**Runtime**: nodejs

**Auth**: Authenticated user

**GET Response**: `200 { "keys": { ... } }` — decrypted BYOK payload (never logged).
**POST Body**: `{ "keys": ByokPayload }` — encrypts and stores.

### `POST /api/settings/bulk-test`

Tests all configured provider keys in parallel.

**Runtime**: nodejs

**Response**: `200 { "results": { "providerId": { "ok": true/false, "error": "..." } } }`

### `POST /api/settings/test-provider`

Test a single provider key.

**Runtime**: nodejs

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `provider` | ProviderId | Yes | Provider to test |
| `apiKey` | string | No | Optional override key |

**Response**: `200 { "ok": true/false, "model": "...", "latencyMs": N }`

### `POST /api/settings/test-market-provider`

Test a market data provider connection.

**Runtime**: nodejs

**Response**: `200 { "ok": true/false, "error": "..." }`

### `POST /api/settings/chat-model`

Set the user's default chat model override.

### `POST /api/settings/vision-model`

Set the user's default vision model override.

### `POST /api/settings/embedding-model`

Set the user's default embedding model override.

### `POST /api/settings/analysis-mode`

Set the user's default multi-agent analysis mode (`single`, `quick`, `standard`, `full`, `auto`).

### `POST /api/settings/fallback-chain`

Set the user's provider fallback chain (ordered list of provider IDs).

### `POST /api/settings/symbols`

Manage user's watched symbols.

### `GET /api/settings/usage-by-provider` / `GET /api/settings/usage-by-agent`

Return AI usage breakdowns for the current user.

---

## 11. Admin Routes

### `POST /api/admin/test-alert-email`

Send a test email through Resend to confirm the alerts pipeline is wired
correctly. Defense-in-depth session recheck.

**Runtime**: nodejs

| Field | Type   | Required | Notes                                   |
|-------|--------|----------|-----------------------------------------|
| `to`  | string | No       | Override recipient. Default: `ALERT_TO_EMAIL` env |

**Responses**:

| Status | Body                                                    |
|--------|---------------------------------------------------------|
| 200    | `{ "id": "<resend-message-id>" }`                       |
| 401    | `{ "error": "unauthorized" }`                           |
| 502    | `{ "error": "resend HTTP <status>: <text>" }`           |
| 503    | `{ "missing": ["RESEND_API_KEY", "ALERT_FROM_EMAIL", …] }` |

**Requires**: `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`.

### `POST /api/admin/test-telegram`

Send a test Telegram message through the configured bot. Mirrors the email
test route.

**Runtime**: nodejs

| Field    | Type   | Required | Notes                                          |
|----------|--------|----------|------------------------------------------------|
| `chatId` | string | No       | Override chat ID. Default: `TELEGRAM_CHAT_ID` env |

**Responses**: Same shape as test-alert-email (status codes 200/401/502/503).

**Requires**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

### `POST /api/admin/flush`

Flush internal caches (dev-only).

### `POST /api/admin/impersonate`

Dev-only user impersonation (requires `ENABLE_IMPERSONATION=true`).

### `GET /api/admin/onboarding/status`, `POST /api/admin/onboarding/reset`, `GET /api/admin/onboarding/inspect`

Admin onboarding management — inspect progress, reset wizard, check status for any user.

### `GET /api/admin/diagnostics/tool-telemetry`

Inspect recent AI tool call telemetry.

### `GET /api/admin/diagnostics/traces`

List persisted diagnostic traces.

### `GET /api/admin/diagnostics/trace/[id]`

Get a single diagnostic trace by ID.

### `GET /api/admin/logs/stream`

Real-time log stream (dev only, requires `ENABLE_LOG_STREAM=true`).

### `GET /api/admin/features`

List and toggle runtime feature flags.

---

## 12. Billing Routes

### `POST /api/billing/checkout`

Create a NOWPayments checkout session for a plan purchase.

**Runtime**: nodejs

**Body**: `{ "planId": string }`

**Response**: `200 { "url": "https://nowpayments.io/payment/...", "paymentId": "..." }`

### `GET /api/billing/portal`

Get current subscription status and portal data.

**Response**: `200 { "subscription": { ... }, "plans": [...] }`

### `POST /api/billing/webhook`

NOWPayments IPN webhook. HMAC-SHA512 signature verified before business logic.
Exempt from middleware auth.

**Runtime**: nodejs

**Auth**: `x-nowpayments-sig` header verified against `NOWPAYMENTS_IPN_SECRET`. Returns 401 on mismatch.

**Response**: `200 OK` (always acknowledged).

---

## 13. Bot Routes

### `POST /api/bot/link-code`

Generate a one-time link code for Telegram bot linking.

**Runtime**: nodejs

**Response**: `200 { "code": "ABC123", "expiresAt": N }`

### `GET /api/bot/status`

Check Telegram linking status.

**Response**: `200 { "linked": true/false, "chatId": "..." }`

### `POST /api/bot/unlink`

Unlink Telegram from the user's account.

**Response**: `200 { "ok": true }`

---

## 14. Decision Signals Routes

### `GET /api/decision-signals`

List decision signals for the current user.

### `GET /api/decision-signals/stats`

Aggregate decision signal statistics (win rate, by model, by horizon, etc.).

### `POST /api/decision-signals/[id]/feedback`

Submit user feedback for a decision signal.

---

## 15. Portfolio Routes

### `GET /api/portfolio/positions`

List open/closed portfolio positions.

### `POST /api/portfolio/positions`

Create a new position.

### `GET /api/portfolio/positions/[id]`

Get a single position.

### `PATCH /api/portfolio/positions/[id]`

Update (close/edit) a position.

### `GET/POST /api/portfolio/settings`

Get/update portfolio settings (account balance, risk parameters).

### `GET /api/portfolio/risk`

Get risk assessment for current portfolio.

---

## 16. Notification Routes

### `GET/POST /api/notifications/route-config`

Get/update notification routing configuration (which channels for which events).

### `GET/POST /api/notifications/noise-config`

Get/update noise control settings (suppress similar alerts, debounce intervals).

---

## 17. Telegram Routes

### `POST /api/telegram/webhook`

Telegram bot update handler. Receives webhook payloads from Telegram's
servers. Exempt from global middleware auth — uses Telegram's
`X-Telegram-Bot-Api-Secret-Token` header instead.

**Runtime**: nodejs

**Auth**: `x-telegram-bot-api-secret-token` header must match
`TELEGRAM_SECRET_TOKEN` env var (if configured). Returns `401 Unauthorized`
text response on mismatch.

**Response**: Always `200 OK` (text/plain). Errors in `handleTelegramWebhook()`
are logged but not surfaced to Telegram.

---

## 18. Health Routes

### `GET /api/health`

Enhanced health check. Returns system status including DB connectivity, pgvector status, cron run health, and deployed version.

**Runtime**: nodejs

| Check | What it verifies |
|-------|-----------------|
| `db` | `SELECT 1` — DB connectivity + latency |
| `env` | Required env vars present (no values exposed) |
| `cron` | Recent cron runs + stuck job detection |
| `pgvector` | pgvector extension installed |

**Response**: `200 { "status": "ok", "checks": {...}, "version": "sha", "ts": "..." }` or `503` on failure.

### `GET /api/health/db`

Focused DB health check — connectivity + migration status.

---

## 19. Cron Routes

All cron routes are `GET` endpoints gated by `withCronAuth()`. They accept
either a `Bearer` token (`Authorization: Bearer <CRON_SECRET>`) or a valid
session cookie. Used by systemd timers on the GCE VM and Vercel's cron
scheduler. Many routes are now **manual-fallback paths** — primary
scheduling runs on the GCE worker VM; the URL stays for hand-triggering
during worker outages.

All return: `200 { "ok": true, "processed": <int>, "note": "<string>" }`

### 12.1 Calendar & News (light HTTP pokers)

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/warm-cache` | Every 2 min | Pre-fetch prices (all 3 symbols) + 1h candles. 4h candles warmed every 10th tick only. Staggered 1.5 s between candle calls to respect provider throttle. `maxDuration=30s` |
| `/api/cron/alerts` | Every 5 min | Evaluate active, unfired alerts against latest prices/indicators. Fire notifications (email/Telegram). `maxDuration=60s` |
| `/api/cron/news` | Every 5 min | Marketaux + Finnhub article ingestion. Backfills missed windows: fetches since most-recent stored article (6h fallback if table empty, 7-day clamp). Paged up to 4 pages of 50 articles each. `maxDuration=60s` |
| `/api/cron/calendar` | Every 15 min | FRED release date ingestion → `economic_events`. Treats `ProviderError` as "skip this tick" (returns 200 with note) rather than 500. `maxDuration=60s` |

### 12.2 Heavy Jobs (manual-fallback, primary on GCE worker)

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/snapshots` | Daily 00:05 UTC | Daily HLOC/pivots/ATR snapshots from 1h candles. Upserts into `daily_snapshots`. |
| `/api/cron/briefings` | ~Every 5 min (worker) | Pre/post-event briefings: scans `economic_events` for high-impact events in the pre-event window [now+28m, now+32m] and post-event window [now-32m, now-28m] with actual values. Idempotent via `briefings_emitted` PK. |
| `/api/cron/embedding-backfill` | ~Every 5 min (worker) | News embedding computation via AI Gateway. Web route is capped at 256 rows (32 batch × ≤256 max). Worker version ramps to 1024. `maxDuration=60s` |
| `/api/cron/cot` | Friday 22:00 UTC | CFTC Commitment-of-Traders ingestion. Fetches 4 weekly rows per symbol, upserts by `(symbol, report_date)` PK. |
| `/api/cron/fred-actuals` | Daily 01:30 UTC | Backfills `economic_events.actual` for FRED rows whose value was null. Patches only rows where `actuals_filled_at IS NULL`. Searches ±7 days around release date. |
| `/api/cron/weekly-review` | Sunday 18:00 UTC | Weekly journal review. Idempotent within an ISO week via `briefings_emitted` PK on `(weekly_review:<isoWeek>, 'weekly_review')`. |
| `/api/cron/cleanup-uploads` ~Daily | Delete chat-attachment blobs from Supabase Storage older than 7 days. Scans 30 date prefixes, deletes via Storage API. `maxDuration=60s`. | |

### 12.3 Cron Warm-Cache Details

**Endpoint**: `GET /api/cron/warm-cache`

- Prices: all 3 symbols in parallel.
- Candles: `1h` (every tick) + `4h` (only on minutes divisible by 10).
- 1.5 s stagger between candle calls to stay under provider throttle
  (BiQuote free tier: ~10 req/min).
- Tolerates individual failures — aggregates errors in note field.

---

## 20. Runtime Split

| Runtime | Routes |
|---------|--------|
| **nodejs** | All API route handlers (`/api/chat/*`, `/api/auth/*`, `/api/alerts/*`, `/api/journal/*`, `/api/push/*`, `/api/upload`, `/api/settings/*`, `/api/admin/*`, `/api/billing/*`, `/api/bot/*`, `/api/decision-signals/*`, `/api/portfolio/*`, `/api/notifications/*`, `/api/telegram/*`, `/api/health/*`, all `/api/cron/*`, all `/api/market/*`, `/api/news`, `/api/calendar`, `/api/sentiment`, `/api/me/*`, `/api/onboarding/*`) |
| **edge** | Middleware only (`middleware.ts`) |

Currently all API route handlers run on `nodejs`. The edge runtime is
reserved exclusively for middleware, where it authenticates via Web Crypto
without Node-specific imports.

---

## 21. Response Envelope Reference

### Success

```json
{
  "ok": true,          // Cron routes only
  "<entity>": { … },  // e.g. "thread", "alert", "entry", "ticks"
  // Cron routes additionally include:
  "processed": 6,
  "note": "matched=3 fired=1 skipped=2"
}
```

### Error

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Human-readable description",
    "details": { … },     // Optional: Zod flatten output, etc.
    "requestId": "uuid"   // Present when X-Request-Id was set
  }
}
```

### Error Codes

| Code              | HTTP | Meaning                                      |
|-------------------|------|----------------------------------------------|
| `VALIDATION`      | 400  | Zod parse failure, missing field, invalid JSON |
| `AUTH`            | 401  | Wrong password, missing/expired token         |
| `NOT_FOUND`       | 404  | Entity not found (thread, alert, journal entry) |
| `PROVIDER`        | 502  | Upstream data provider failure                |
| `BUDGET_EXCEEDED` | 402  | Daily AI spend cap hit                        |
| `INTERNAL`        | 500  | Unhandled exception                           |

---

## Endpoint Quick Index

| Method   | Path                                         | Group              |
|----------|----------------------------------------------|--------------------|
| `GET/POST` | `/api/auth/[...nextauth]`                  | Auth               |
| `POST`   | `/api/auth/verify-email`                     | Auth               |
| `POST`   | `/api/chat`                                  | Chat               |
| `GET`    | `/api/chat/threads`                          | Chat               |
| `POST`   | `/api/chat/threads`                          | Chat               |
| `DELETE` | `/api/chat/threads/bulk-delete`              | Chat               |
| `POST`   | `/api/chat/threads/fork`                     | Chat               |
| `GET`    | `/api/chat/threads/[id]`                     | Chat               |
| `DELETE` | `/api/chat/threads/[id]`                     | Chat               |
| `GET`    | `/api/chat/threads/[id]/summary`             | Chat               |
| `GET`    | `/api/chat/threads/[id]/opinions`            | Chat               |
| `GET`    | `/api/chat/threads/[id]/export`              | Chat               |
| `GET`    | `/api/chat/analysis-jobs/[jobId]`            | Chat               |
| `GET`    | `/api/market/price`                          | Market             |
| `GET`    | `/api/market/candles`                        | Market             |
| `POST`   | `/api/market/indicators`                     | Market             |
| `POST`   | `/api/market/structure`                      | Market             |
| `GET`    | `/api/market/search`                         | Market             |
| `GET`    | `/api/market/stream`                         | Market             |
| `GET`    | `/api/news`                                  | News               |
| `GET`    | `/api/calendar`                              | Calendar           |
| `GET`    | `/api/sentiment`                             | Sentiment          |
| `GET`    | `/api/alerts`                                | Alerts             |
| `POST`   | `/api/alerts`                                | Alerts             |
| `GET`    | `/api/alerts/preview`                        | Alerts             |
| `GET`    | `/api/alerts/preview-digest`                 | Alerts             |
| `GET`    | `/api/alerts/[id]`                           | Alerts             |
| `PATCH`  | `/api/alerts/[id]`                           | Alerts             |
| `DELETE` | `/api/alerts/[id]`                           | Alerts             |
| `GET`    | `/api/journal`                               | Journal            |
| `POST`   | `/api/journal`                               | Journal            |
| `GET`    | `/api/journal/[id]`                          | Journal            |
| `PATCH`  | `/api/journal/[id]`                          | Journal            |
| `DELETE` | `/api/journal/[id]`                          | Journal            |
| `POST`   | `/api/journal/import`                        | Journal            |
| `GET`    | `/api/journal/review`                        | Journal            |
| `POST`   | `/api/push/subscribe`                        | Push               |
| `POST`   | `/api/push/unsubscribe`                      | Push               |
| `POST`   | `/api/upload`                                | Upload             |
| `POST`   | `/api/dev/login`                             | Dev                |
| `GET`    | `/api/me/keys`                               | Settings           |
| `POST`   | `/api/me/keys`                               | Settings           |
| `GET`    | `/api/settings/catalog`                      | Settings           |
| `POST`   | `/api/settings/bulk-test`                    | Settings           |
| `POST`   | `/api/settings/test-provider`                | Settings           |
| `POST`   | `/api/settings/test-market-provider`         | Settings           |
| `POST`   | `/api/settings/chat-model`                   | Settings           |
| `POST`   | `/api/settings/vision-model`                 | Settings           |
| `POST`   | `/api/settings/embedding-model`              | Settings           |
| `POST`   | `/api/settings/analysis-mode`                | Settings           |
| `POST`   | `/api/settings/fallback-chain`               | Settings           |
| `POST`   | `/api/settings/symbols`                      | Settings           |
| `GET`    | `/api/settings/usage-by-provider`            | Settings           |
| `GET`    | `/api/settings/usage-by-agent`               | Settings           |
| `POST`   | `/api/admin/test-alert-email`                | Admin              |
| `POST`   | `/api/admin/test-telegram`                   | Admin              |
| `POST`   | `/api/admin/flush`                           | Admin              |
| `POST`   | `/api/admin/impersonate`                     | Admin              |
| `GET`    | `/api/admin/features`                        | Admin              |
| `GET`    | `/api/admin/cron-history`                    | Admin              |
| `GET`    | `/api/admin/users`                           | Admin              |
| `GET`    | `/api/admin/logs/stream`                     | Admin              |
| `GET`    | `/api/admin/onboarding/inspect`              | Admin              |
| `POST`   | `/api/admin/onboarding/reset`                | Admin              |
| `GET`    | `/api/admin/onboarding/status`               | Admin              |
| `GET`    | `/api/admin/diagnostics/tool-telemetry`      | Admin              |
| `GET`    | `/api/admin/diagnostics/traces`              | Admin              |
| `GET`    | `/api/admin/diagnostics/trace/[id]`          | Admin              |
| `POST`   | `/api/billing/checkout`                      | Billing            |
| `GET`    | `/api/billing/portal`                        | Billing            |
| `POST`   | `/api/billing/webhook`                       | Billing            |
| `POST`   | `/api/bot/link-code`                         | Bot                |
| `GET`    | `/api/bot/status`                            | Bot                |
| `POST`   | `/api/bot/unlink`                            | Bot                |
| `GET`    | `/api/decision-signals`                      | Decision Signals   |
| `GET`    | `/api/decision-signals/stats`                | Decision Signals   |
| `POST`   | `/api/decision-signals/[id]/feedback`        | Decision Signals   |
| `GET`    | `/api/portfolio/positions`                   | Portfolio          |
| `POST`   | `/api/portfolio/positions`                   | Portfolio          |
| `GET`    | `/api/portfolio/positions/[id]`              | Portfolio          |
| `PATCH`  | `/api/portfolio/positions/[id]`              | Portfolio          |
| `GET`    | `/api/portfolio/settings`                    | Portfolio          |
| `POST`   | `/api/portfolio/settings`                    | Portfolio          |
| `GET`    | `/api/portfolio/risk`                        | Portfolio          |
| `GET`    | `/api/notifications/route-config`            | Notifications      |
| `POST`   | `/api/notifications/route-config`            | Notifications      |
| `GET`    | `/api/notifications/noise-config`            | Notifications      |
| `POST`   | `/api/notifications/noise-config`            | Notifications      |
| `POST`   | `/api/telegram/webhook`                      | Telegram           |
| `GET`    | `/api/health`                                | Health             |
| `GET`    | `/api/health/db`                             | Health             |
| `GET`    | `/api/onboarding/save-progress`              | Onboarding         |
| `POST`   | `/api/onboarding/save-progress`              | Onboarding         |
| `GET`    | `/api/cron/warm-cache`                       | Cron               |
| `GET`    | `/api/cron/alerts`                           | Cron               |
| `GET`    | `/api/cron/news`                             | Cron               |
| `GET`    | `/api/cron/calendar`                         | Cron               |
| `GET`    | `/api/cron/snapshots`                        | Cron               |
| `GET`    | `/api/cron/briefings`                        | Cron               |
| `GET`    | `/api/cron/embedding-backfill`               | Cron               |
| `GET`    | `/api/cron/cot`                              | Cron               |
| `GET`    | `/api/cron/fred-actuals`                     | Cron               |
| `GET`    | `/api/cron/weekly-review`                    | Cron               |
| `GET`    | `/api/cron/cleanup-uploads`                  | Cron               |
| `GET`    | `/api/cron/cleanup-telemetry`                | Cron               |
| `GET`    | `/api/cron/evaluate-signals`                 | Cron               |
| `GET`    | `/api/cron/cleanup-tokens`                   | Cron               |

**Total: 93+ endpoint files** covering: Auth, Chat (13), Market (6), News/Calendar/Sentiment (3), Alerts (7), Journal (7), Push (2), Upload (1), Dev (1), Settings (12), Admin (12), Billing (3), Bot (3), Decision Signals (3), Portfolio (7), Notifications (4), Telegram (1), Health (2), Onboarding (1), Cron (13).
