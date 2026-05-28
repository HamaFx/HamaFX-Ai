# 08 — Backend & API

## One service, one type system

Personal-mode: a **single Next.js deploy on Vercel** owns everything. No separate worker.

| Concern        | Where it lives                                                  |
| -------------- | --------------------------------------------------------------- |
| UI + RSC pages | `apps/web/src/app/(app)/**`                                     |
| API endpoints  | `apps/web/src/app/api/**` (route handlers)                      |
| Scheduled jobs | `apps/web/src/app/api/cron/**` (poked from the VM) + `apps/worker/src/jobs/**` (heavy, in-process) |
| Auth           | `middleware.ts` checks a signed cookie set by `/api/auth/login` |
| DB             | Supabase Postgres (used as a plain DB) via Drizzle              |
| Cache          | Next.js Data Cache (`unstable_cache` + fetch-cache) via the `Cache` interface in `packages/data/src/cache` |

## Route map

### Auth

| Route              | Method | Runtime | Purpose                                                       |
| ------------------ | ------ | ------- | ------------------------------------------------------------- |
| `/api/auth/login`  | POST   | Edge    | `{ password }` → if matches `APP_PASSWORD`, set signed cookie |
| `/api/auth/logout` | POST   | Edge    | Clear cookie                                                  |

`apps/web/src/middleware.ts` ensures `(app)/*` and `/api/*` (except auth + cron) require the cookie. Cron endpoints are protected by Vercel's `CRON_SECRET` header instead.

### Chat

| Route                          | Method | Runtime | Purpose                                   |
| ------------------------------ | ------ | ------- | ----------------------------------------- |
| `/api/chat`                    | POST   | Node    | Streaming chat with tool-loop agent (SSE) |
| `/api/chat/threads`            | GET    | Edge    | List threads                              |
| `/api/chat/threads`            | POST   | Edge    | Create new thread                         |
| `/api/chat/threads/[id]`       | GET    | Edge    | Load thread + messages                    |
| `/api/chat/threads/[id]`       | DELETE | Edge    | Delete thread                             |
| `/api/chat/threads/[id]/title` | POST   | Node    | Auto-title (cheap LLM call)               |

### Market data

| Route                    | Method | Runtime | Purpose                               |
| ------------------------ | ------ | ------- | ------------------------------------- |
| `/api/market/price`      | GET    | Edge    | `?symbols=XAUUSD,EURUSD` → `Tick[]`   |
| `/api/market/candles`    | GET    | Edge    | `?symbol=&tf=&limit=` → `Candle[]`    |
| `/api/market/indicators` | POST   | Edge    | Compute indicators on a candle window |
| `/api/market/snapshot`   | GET    | Edge    | One-shot bias + key levels per symbol |

These routes:

1. Validate input with zod.
2. Hit the cache layer (`packages/data/src/cache` — Next.js Data Cache).
3. On miss, call `packages/data` adapters (which apply failover).
4. Return DTOs from `packages/shared`.

### News & calendar

| Route           | Method | Runtime | Purpose                                      |
| --------------- | ------ | ------- | -------------------------------------------- |
| `/api/news`     | GET    | Edge    | `?symbol=&limit=&since=` → `NewsArticle[]`   |
| `/api/calendar` | GET    | Edge    | `?from=&to=&importance=` → `EconomicEvent[]` |

These read from Supabase (populated by cron) — they don't hit external providers directly.

### Alerts & journal

| Route                | Method | Runtime | Purpose          |
| -------------------- | ------ | ------- | ---------------- |
| `/api/alerts`        | GET    | Edge    | List alerts      |
| `/api/alerts`        | POST   | Edge    | Create alert     |
| `/api/alerts/[id]`   | DELETE | Edge    | Remove alert     |
| `/api/journal`       | GET    | Edge    | List entries     |
| `/api/journal`       | POST   | Edge    | Create entry     |
| `/api/journal/[id]`  | PATCH  | Edge    | Edit entry       |
| `/api/journal/[id]`  | DELETE | Edge    | Remove entry     |
| `/api/journal/stats` | GET    | Edge    | Aggregated stats |

### Cron (VM-triggered)

These endpoints are GET handlers invoked by `hamafx-light-*.service` units on the GCE worker VM, with `Authorization: Bearer ${CRON_SECRET}`. Use `withCronAuth(req, fn)` from `apps/web/src/lib/cron.ts`. Bypass the password gate; reject anything without the correct secret.

| Route                          | Cadence         | Driver                            | Purpose                                                      |
| ------------------------------ | --------------- | --------------------------------- | ------------------------------------------------------------ |
| `/api/cron/news`               | every 5 min     | `hamafx-light-news.timer`         | Poll Marketaux + Finnhub news → upsert into Supabase         |
| `/api/cron/calendar`           | every 15 min    | `hamafx-light-calendar.timer`     | Poll Trading Economics + FRED → upsert events                |
| `/api/cron/alerts`             | every 5 min     | `hamafx-light-alerts.timer`       | Evaluate active alert rules vs latest `live_ticks`, fire     |
| `/api/cron/warm-cache`         | every 2 min     | `hamafx-light-warm-cache.timer`   | Pre-fetch the most-used `(symbol, tf)` keys so the first chat / chart load of the day is hot |
| `/api/cron/snapshots`          | manual fallback | (heavy job runs on the worker)    | Daily HLOC + pivots + ATR for next session                   |
| `/api/cron/briefings`          | manual fallback | (heavy job runs on the worker)    | Pre/post macro-event briefings                               |
| `/api/cron/cot`                | manual fallback | (heavy job runs on the worker)    | Weekly CFTC Commitment-of-Traders ingestion                  |
| `/api/cron/embedding-backfill` | manual fallback | (heavy job runs on the worker)    | Embed any rows missing vectors                               |
| `/api/cron/fred-actuals`       | manual fallback | (heavy job runs on the worker)    | Backfill `economic_events.actual` once prints land           |
| `/api/cron/weekly-review`      | manual fallback | (heavy job runs on the worker)    | Sunday weekly journal review                                 |

The "manual fallback" routes still exist so an operator can hand-trigger any heavy job during a worker outage:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$PRODUCTION_URL/api/cron/embedding-backfill"
```

Heavy jobs in `apps/worker/src/jobs/<name>.ts` run in-process inside `hamafx-worker.service` (no HTTP roundtrip; no 60 s ceiling). Their systemd units pair with timers in `infra/cron-vm/units/hamafx-job-<name>.{service,timer}` and ping `healthchecks.io` on start / success / fail.

> Every cron handler must be **idempotent** and **fast**. Light routes batch in pages of ≤ 50 rows per invocation; the next tick continues if there's more.

## Auth flow

```mermaid
sequenceDiagram
    participant U as User (mobile)
    participant W as Web (Vercel)

    U->>W: GET /chat
    W->>W: middleware reads `hfx_auth` cookie
    alt no/invalid cookie
      W-->>U: 302 /login
      U->>W: POST /api/auth/login { password }
      W->>W: timing-safe compare to APP_PASSWORD
      alt match
        W-->>U: Set-Cookie hfx_auth=<signed>; HttpOnly; Secure; Max-Age=30d
        W-->>U: 302 /chat
      else mismatch
        W-->>U: 401 with rate-limit (in-memory, by IP)
      end
    else valid cookie
      W-->>U: render
    end
```

Cookie is HMAC-signed with `AUTH_COOKIE_SECRET` (random 32+ byte secret) so it can't be forged.

## Cron security

- Vercel adds `Authorization: Bearer ${CRON_SECRET}` automatically when invoking your cron endpoints.
- Each cron handler verifies that header (timing-safe). All other requests get 401.
- Cron handlers do **not** require the user password cookie.

## Error envelope

All API errors return:

```json
{
  "error": {
    "code": "VALIDATION" | "AUTH" | "NOT_FOUND" | "PROVIDER_UNAVAILABLE" | "INTERNAL",
    "message": "Human-readable",
    "details": { "...optional zod issues..." }
  }
}
```

Status codes: 400 (validation), 401 (auth), 404, 503 (provider), 500 (internal).

## Performance targets

| Endpoint                           | p50      | p95       |
| ---------------------------------- | -------- | --------- |
| `GET /api/market/price`            | < 80 ms  | < 250 ms  |
| `GET /api/market/candles` (cached) | < 120 ms | < 350 ms  |
| `GET /api/market/candles` (cold)   | < 600 ms | < 1500 ms |
| `POST /api/chat` first token       | < 800 ms | < 2000 ms |
| `GET /api/news`                    | < 120 ms | < 300 ms  |
| `GET /api/calendar`                | < 120 ms | < 300 ms  |
