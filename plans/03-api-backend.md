# Implementation Plan: API Backend Multi-User Refactor

This document outlines the systematic refactoring of the existing 37 API route handlers (across 10 domains) in the `apps/web/app/api` directory to support a robust, multi-user, self-hosted architecture.

## 1. Current State
Currently, HamaFX-Ai operates with ~37 API routes across 10 functional domains. Because it was designed for a single user, the API currently assumes a global context:
- **No User Context:** None of the endpoints extract or validate a user identity.
- **Unscoped Queries:** Database queries lack `WHERE user_id = ?` clauses.
- **Global Rate Limiting:** Rate limiting is an in-memory Map keyed by IP address.
- **Single External Config:** Test endpoints (admin) and webhooks assume a single `TELEGRAM_CHAT_ID` and `ALERT_TO_EMAIL`.

**Route Domains:**
- `auth/` (2 routes: login, logout)
- `chat/` (3 routes: streaming, threads list, thread operations)
- `alerts/` (2 routes: collection, item ops)
- `journal/` (2 routes: collection, item ops)
- `market/` (4 routes: price, candles, indicators, structure)
- `cron/` (11 routes: scheduled tasks)
- `admin/` (2 routes: test-alert-email, test-telegram)
- `push/` (2 routes: subscribe, unsubscribe)
- `telegram/` (1 route: webhook)
- `upload/` (1 route: image upload)

---

## 2. User Context Extraction Pattern

We will implement NextAuth.js (Auth.js v5) to handle session management securely. We need a standardized way to extract, validate, and inject the authenticated user's context into every protected route.

### `getUserFromRequest` Helper
```typescript
// packages/shared/src/auth/index.ts
import { auth } from "@/auth"; // NextAuth v5 instance
import { UnauthorizedError } from "@/errors";

export async function getUserFromRequest() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError("Authentication required");
  }
  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name
  };
}
```

### `withAuth` Higher-Order Function (Route Wrapper)
To reduce boilerplate and standardize error handling across all App Router endpoints:
```typescript
// packages/shared/src/api/withAuth.ts
import { NextResponse } from "next/server";
import { getUserFromRequest } from "../auth";

export function withAuth(handler: (req: Request, ctx: { params: any, user: any }) => Promise<Response>) {
  return async (req: Request, { params }: { params: any }) => {
    try {
      const user = await getUserFromRequest();
      return await handler(req, { params, user });
    } catch (error) {
      if (error.name === "UnauthorizedError") {
        return NextResponse.json({ error: { code: "UNAUTHORIZED", message: error.message } }, { status: 401 });
      }
      console.error(error);
      return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Server error" } }, { status: 500 });
    }
  };
}
```

---

## 3. Route-by-Route Refactor Plan

Each route is mapped with its expected refactoring changes.

### A. Auth Routes (Replace Entirely)
Replaced by NextAuth.js built-in API routing.

| Route File | Current Behavior | Target Behavior | Auth Needed |
|---|---|---|---|
| `/api/auth/login` | Validates `APP_PASSWORD`, sets JWT cookie | Replaced by `app/api/auth/[...nextauth]/route.ts`. Handles Credentials or OAuth. | Public |
| `/api/auth/logout` | Clears JWT cookie | Replaced by NextAuth sign-out flows. | Public |

### B. Shared Data Routes (Market Data)
No user scoping needed. Market data is universal.

| Route File | Current Behavior | Target Behavior | Auth Needed |
|---|---|---|---|
| `/api/market/price` | Fetches live price for symbol | Keep as is. Implement API key/rate limits if exposed publicly, but safe to keep public. | No |
| `/api/market/candles` | Returns OHLCV arrays | Keep as is. | No |
| `/api/market/indicators` | Runs TA indicators | Keep as is. | No |
| `/api/market/structure` | SMC market structure data | Keep as is. | No |

### C. User-Scoped Routes
Must be wrapped in `withAuth` and ALL database queries MUST include `user_id`.

| Route File | Current Behavior | Target Behavior | Auth Needed |
|---|---|---|---|
| `/api/chat` (POST) | Streams AI completion | Inject `user.id`. Scope RAG to user's documents/history. Update `daily_ai_spend` with `user_id`. | Yes |
| `/api/chat/threads` (GET) | Lists all chat threads | `SELECT * FROM threads WHERE user_id = ?` | Yes |
| `/api/chat/threads/[id]` (DEL) | Deletes a thread | `DELETE FROM threads WHERE id = ? AND user_id = ?` | Yes |
| `/api/alerts` (GET, POST) | Lists/creates alerts | `SELECT/INSERT ... WHERE user_id = ?` | Yes |
| `/api/alerts/[id]` (PUT, DEL) | Updates/deletes alert | `UPDATE/DELETE ... WHERE id = ? AND user_id = ?` | Yes |
| `/api/journal` (GET, POST) | Lists/creates trades | `SELECT/INSERT ... WHERE user_id = ?` | Yes |
| `/api/journal/[id]` (PUT, DEL)| Updates/deletes trade | `UPDATE/DELETE ... WHERE id = ? AND user_id = ?` | Yes |
| `/api/push/subscribe` (POST) | Saves PushSubscription | `INSERT INTO web_push_subscriptions ... (user_id)` | Yes |
| `/api/push/unsubscribe` (POST)| Removes PushSubscription| `DELETE FROM web_push_subscriptions WHERE endpoint = ? AND user_id = ?` | Yes |
| `/api/upload` (POST) | Saves image globally | Save to S3/local under `/[user_id]/[uuid].png`. | Yes |

### D. Cron Routes (11 Endpoints)
Cron jobs must iterate across all active users where applicable, instead of running a single global task.

| Route File | Current Behavior | Target Behavior | Auth Needed |
|---|---|---|---|
| `/api/cron/alerts/check` | Checks global rules | Iterate over `SELECT id FROM users`. Check rules per user's portfolio. | Cron Secret |
| `/api/cron/briefings/daily` | Generates 1 briefing | Generate personalized briefings per user based on their watchlists. | Cron Secret |
| `/api/cron/briefings/weekly`| Generates 1 briefing | Generate personalized weekly briefings per user. | Cron Secret |
| `/api/cron/journal/stats` | Calculates global stats| Calculate stats `GROUP BY user_id`. | Cron Secret |
| `/api/cron/ai/usage-reset` | Resets global spend | `UPDATE daily_ai_spend SET spend = 0` (now applies to all user rows). | Cron Secret |
| `/api/cron/mt5/sync` | Syncs 1 MT5 terminal | Iterate users with MT5 connected -> Sync via user's saved MT5 creds/tokens. | Cron Secret |
| `/api/cron/subscriptions/chk`| Checks 1 Stripe sub | (If adding SaaS logic later) Check all users. | Cron Secret |
| `/api/cron/news/fetch` | Fetches global news | **Global task.** Keep as is (caches for everyone). | Cron Secret |
| `/api/cron/calendar/fetch` | Fetches economic cal | **Global task.** Keep as is (caches for everyone). | Cron Secret |
| `/api/cron/cache/warm` | Warms global cache | **Global task.** Keep as is. | Cron Secret |
| `/api/cron/db/cleanup` | Deletes old logs | **Global task.** Target all `user_id` rows older than X days. | Cron Secret |

### E. Admin & External Integration Routes
Webhook endpoints need dynamic resolution to map external data to the correct internal user.

| Route File | Current Behavior | Target Behavior | Auth Needed |
|---|---|---|---|
| `/api/admin/test-alert-email`| Uses `.env` email | Fetch user's profile: `SELECT email FROM users WHERE id = user.id`. Send to that email. | Yes |
| `/api/admin/test-telegram` | Uses `.env` chat ID | Fetch `telegram_chat_id` from user's settings. Send to that chat ID. | Yes |
| `/api/telegram/webhook` | Listens to 1 bot | Parse `msg.chat.id`. Look up `user_id` in DB. Route command to that user's AI context. | Webhook Token |

---

## 4. Per-User Rate Limiting

We must migrate from in-memory (which fails in distributed/multi-user setups) to a Postgres-backed sliding window.

### Schema
```sql
CREATE TABLE rate_limits (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint_group VARCHAR(50) NOT NULL, -- e.g., "ai_chat", "general_api"
  window_start TIMESTAMP NOT NULL,
  request_count INT DEFAULT 1,
  PRIMARY KEY (user_id, endpoint_group, window_start)
);
```

### Implementation
- Create middleware or a service wrapper `checkRateLimit(userId, group, limit, windowMs)`.
- Use PGlite/Postgres `INSERT ... ON CONFLICT ... DO UPDATE` with `NOW()` rounding down to the current window.
- Respond with standard `429 Too Many Requests`.

---

## 5. Request Validation & Security

1. **Internal Payload Modification:**
   Even if a user passes `userId: "admin-id"` in the POST body, it must be ignored. The `userId` MUST ONLY be retrieved from `getUserFromRequest()`.
2. **Strict Zod Boundaries:**
   ```typescript
   const CreateAlertSchema = z.object({
     symbol: z.string(),
     condition: z.enum(["above", "below"]),
     price: z.number()
     // DO NOT include userId in schema accepted from client
   });
   ```
3. **Cross-User Protection:**
   Any `UPDATE` or `DELETE` must include `AND user_id = ?`. If a database operation returns 0 rows updated/deleted, return `404 Not Found` or `403 Forbidden` (avoid exposing that the record exists for another user).

---

## 6. Error Handling Standardization

Replace ad-hoc `res.status(500).send("Error")` with a strict JSON interface:

```typescript
interface ApiErrorResponse {
  error: {
    code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR" | "RATE_LIMITED" | "INTERNAL_ERROR";
    message: string;
    details?: any;
  }
}
```
- `401 Unauthorized`: No valid session.
- `403 Forbidden`: Attempting to access another user's thread/alert.
- `429 Too Many Requests`: Triggered by Postgres rate limit table.

---

## 7. CORS Update

Since users will self-host instances (e.g., via Docker on Railway or VPS) potentially behind reverse proxies:

- **Default:** Keep `same-origin` default for Next.js App Router API.
- **Configurable External Access:** Allow users to set `CORS_ALLOWED_ORIGINS` in `.env` if they run headless setups (e.g., separating the Next.js frontend from the worker daemon). Update `next.config.ts` or `middleware.ts` to reflect this list.

---

## 8. Effort Estimate & Dependencies

### Dependencies
1. **01-database-schema.md** (Must be completed first: `users` table, `user_id` FKs must exist).
2. **02-auth-system.md** (Must be completed first: NextAuth v5 must be configured to provide session tokens).

### Effort Estimates (1 Developer)
| Task | Estimated Time |
|---|---|
| Auth route replacement & wrapper creation | 0.5 Days |
| Refactor `chat/` and `journal/` routes | 1 Day |
| Refactor `alerts/`, `upload/`, and `push/` routes | 1 Day |
| Refactor 11 Cron jobs for cross-user iteration | 1.5 Days |
| Implement Postgres Rate Limiting | 0.5 Days |
| Update Admin endpoints & Telegram webhook mapping | 0.5 Days |
| Testing & Validation | 1 Day |
| **Total Estimated Effort** | **~6 Days** |
