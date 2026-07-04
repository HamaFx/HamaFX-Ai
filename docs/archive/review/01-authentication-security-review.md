# 01 Authentication & Security Review (Target: Hybrid SaaS)

> **Context:** The codebase is mid-migration from a legacy `APP_PASSWORD` single-tenant setup to NextAuth v5. The target state is a hybrid product: an open-source self-hostable core (retaining the simple password gate/legacy mode) alongside a hosted multi-tenant SaaS edition (requiring strong per-user isolation, real authentication, and secure session management).

This document serves as an implementation-ready handoff for addressing the security and multi-tenant isolation gaps identified during the 2026 read-only audit.

---

## 1. Findings

### [Critical] `__system__` User Assumption in Cron Jobs
* **Severity:** Critical (Data Leakage & Misattribution)
* **Locations:**
  - `apps/web/src/app/api/cron/briefings/route.ts` (lines 69, 72-97)
  - `apps/web/src/app/api/cron/weekly-review/route.ts` (lines 37, 41-44)
  - `packages/ai/src/briefings/generate.ts` (lines 162, 331)
  - `packages/ai/src/memory/memory-index.ts` (lines 90, 123, 142)
  - `packages/ai/src/memory/thread-summary.ts` (line 197)
  - `packages/ai/src/persistence.ts` (lines 531, 568)
  - `packages/ai/src/planner.ts` (line 147)
  - `packages/ai/src/title.ts` (line 137)
* **Problem:** Hardcoded arrays like `const activeUsers = ['__system__'];` and fallback logic `userId ?? '__system__'` assume a single-tenant environment.
* **Impact:** In a multi-tenant SaaS, crons will fail to process real users, and AI spend (`dailySpendUsd`) will be aggregated onto a non-existent `__system__` user, breaking billing/budget isolation and potentially cross-pollinating memory summaries.

### [Critical] Lack of Row Level Security (RLS) and Tenant IDs
* **Severity:** Critical (Cross-Tenant Data Exposure)
* **Locations:**
  - `packages/db/src/schema/*.ts` (all files)
  - `packages/db/src/with-user-scope.ts`
* **Problem:** Isolation relies entirely on `withUserScope` (`.where(eq(table.userId, userId))`) being manually applied in Application (L2) and Data (L3) layers. There is no `tenantId`/`orgId` column, and Postgres RLS is explicitly disabled/unused (e.g., `packages/db/drizzle/0009_news_articles.sql: ALTER TABLE "onchain_signals" DISABLE ROW LEVEL SECURITY`).
* **Impact:** A single missed `where()` clause in any route or background job will expose or mutate data across all users (IDOR). This is unacceptable for a multi-tenant SaaS. 

### [High] Global State / Module-Level Caching
* **Severity:** High (Cross-Tenant Key/Data Leakage)
* **Locations:**
  - `packages/ai/src/model.ts` (lines 91-92: `cachedVertex`, `cachedVertexKey`)
  - `packages/ai/src/multi-agent/stream.ts` (line 30: `private agents: Map(...) = new Map();`)
  - `packages/data/src/cache/index.ts` (lines 57-75: `_cache = new MemoryCache()`)
* **Problem:** In-memory caches are scoped globally rather than per-user/per-tenant. For example, `model.ts` caches the Vertex AI client based on a composite key of Google credentials, which might inadvertently share client instances or connection pools. Data caches (`MemoryCache`) lack user-dimension keys.
* **Impact:** High risk of cross-tenant data leakage if one user's request warms a global cache that serves another user's request.

### [High] Development Auth Bypass Exposed
* **Severity:** High (Unauthorized Access Risk)
* **Locations:**
  - `apps/web/src/app/api/dev/login/route.ts`
* **Problem:** A `/api/dev/login` route exists to bypass auth. While it has a `NODE_ENV === 'production'` guard, it automatically inserts a user (`test-user-id`) and signs them in if `ENABLE_DEV_LOGIN === 'true'`.
* **Impact:** If `NODE_ENV` is ever misconfigured or a staging environment runs outside "production" mode, an attacker can instantly gain authenticated access as `test-user-id`.

### [High] Telegram Webhook Fails Open
* **Severity:** High (Unauthenticated Webhook Processing)
* **Locations:**
  - `apps/web/src/app/api/telegram/webhook/route.ts` (lines 43-44)
* **Problem:** If `TELEGRAM_SECRET_TOKEN` is not set in the environment, the webhook accepts all incoming POST requests without validating the Telegram origin.
* **Impact:** Attackers can forge Telegram updates, triggering AI usage, state changes, and API spend on behalf of users.

### [Medium] Missing Authentication Gates on Health/Auth Routes
* **Severity:** Medium
* **Locations:**
  - `apps/web/src/app/api/health/route.ts`
  - `apps/web/src/app/api/health/db/route.ts`
* **Problem:** These routes do not use the `withAuth` HOC. 
* **Impact:** Unauthenticated endpoints can be used for DoS attacks or to enumerate database health/availability.

---

## 2. Root Cause Analysis (Critical/High Findings)

The codebase was originally built for a single, self-hosted trader. The migration to NextAuth v5 introduced the *concept* of multiple users (via the `users` table and `userId` foreign keys), but the Application (L2) and Infrastructure (L4) layers have not caught up. 
1. **Background Jobs:** Cron routes were never updated to query the database for active users, defaulting to the legacy `__system__` placeholder.
2. **Data Isolation:** Drizzle ORM queries manually filter by `userId`. Because it's an opt-in filter (`withUserScope`), it relies entirely on developer discipline rather than database-enforced boundaries (RLS).
3. **State:** Global singletons were safe when the Node process only served one user. In a SaaS, concurrent requests share the Node process, leading to cache poisoning.

---

## 3. Recommended Fixes

To achieve the hybrid open-core/SaaS model while maintaining the architecture layering rules defined in `docs/01-architecture.md` (L1 Presentation \u2192 L2 Application \u2192 L3 Data \u2192 L4 Infra):

### Auth Provider Strategy (2026 Best Practices)
*Current setup:* NextAuth v5 + Drizzle Adapter + Postgres + Supabase (optional).
*Recommendation:* **Stick with NextAuth v5 (Auth.js) + Drizzle.** 
*Why:* 2026 industry analysis (e.g., *Supabase Auth vs Clerk vs NextAuth*, BuildPilot) confirms NextAuth is optimal for hybrid self-hosted/SaaS applications. It avoids vendor lock-in (unlike Clerk) and doesn't force self-hosters to run a full Supabase Auth instance. It natively supports the existing email/password `Credentials` provider for the open-core and OAuth for the SaaS.

### Data Access Layer & Isolation
*Recommendation:* **Implement Postgres Row-Level Security (RLS) via Drizzle ORM.**
*How:* 
1. The 2026 Drizzle RLS guides (*Drizzle ORM - Row-Level Security*) show native RLS support via the `.link()` API or Drizzle table policies.
2. Remove `withUserScope` from the L2/L3 application code.
3. Instead, implement a Data Access Layer (DAL) function `createDrizzle(userId)` that wraps the Postgres connection, executes `SET LOCAL rls.user_id = '${userId}'`, and returns an RLS-scoped Drizzle instance. (Matches Next.js 2026 *Guides: Authentication* recommendations).

### Secrets Management
*Recommendation:* **Centralize secrets delivery (Vercel + GCE Worker).**
*How:* 2026 security playbooks (*Learning from the Vercel Breach*) dictate removing `.env` files. Both the Vercel frontend and the GCE worker must fetch secrets from a speaking vault (e.g., Infisical, AWS Secrets Manager, Google Secret Manager) at runtime. 
The current `BYOK` encryption (AES-256-GCM via `ENCRYPTION_SECRET` in `packages/shared/src/encryption.ts`) is correctly implemented and should be retained for user-provided API keys.

---

## 4. Step-by-step Implementation Plan

### Step 1: Enforce RLS at the Database Layer (L3)
1. In `packages/db/src/schema/*.ts`, define Drizzle RLS policies for every table containing a `userId` (e.g., `chatThreads`, `journalEntries`, `portfolioPositions`).
   ```typescript
   import { pgPolicy } from 'drizzle-orm/pg-core';
   // Example inside the table definition:
   (t) => [
     pgPolicy('user_isolation', {
       for: 'all',
       to: 'authenticated',
       using: sql`${t.userId} = current_setting('rls.user_id')`,
     })
   ]
   ```
2. Create a new `drizzle/` migration to apply these policies.
3. In `packages/db/src/client.ts`, implement an RLS-aware client factory:
   ```typescript
   export async function getScopedDb(userId: string) {
     return db.transaction(async (tx) => {
       await tx.execute(sql`SET LOCAL rls.user_id = ${userId}`);
       return tx; // All queries on this tx are now RLS-enforced
     });
   }
   ```

### Step 2: Remove `__system__` and Fix Cron Jobs (L2)
1. Search `packages/ai/src/` for `'__system__'` and replace it by requiring a valid `userId` parameter in all functions (`dailySpendUsd`, `emitPreEvent`, `emitWeeklyReview`).
2. Update `apps/web/src/app/api/cron/briefings/route.ts` and `weekly-review/route.ts`:
   - Query the `users` table to fetch active user IDs.
   - Iterate over the retrieved user IDs instead of `['__system__']`.

### Step 3: Eliminate Global Caches (L2/L3)
1. In `packages/data/src/cache/index.ts`, update `MemoryCache` and `getDefaultCache` to require a `userId` or `tenantId` namespace for all keys.
2. In `packages/ai/src/model.ts`, ensure `cachedVertexKey` is scoped to the specific user's BYOK credentials to prevent client instance leakage across tenants.

### Step 4: Harden Webhooks and Dev Routes (L1)
1. In `apps/web/src/app/api/telegram/webhook/route.ts`, change the fallback logic. If `TELEGRAM_SECRET_TOKEN` is required by the integration, throw a 500 or return 401 if it's missing from the environment, rather than allowing the request to proceed.
2. In `apps/web/src/app/api/dev/login/route.ts`, add a strict `if (process.env.NODE_ENV !== 'development')` check (rejecting 'test' and 'production' outright).

---

## 5. Acceptance Criteria

1. **Self-Host Compatibility:** Running the application locally with `AUTH_MODE=legacy` and a single `APP_PASSWORD` still allows a single user to log in and use all features without configuring OAuth.
2. **RLS Enforcement:** A route handler using `getScopedDb('user-a')` cannot read or update rows in `chatThreads` where `userId = 'user-b'`, even if the `.where()` clause is intentionally omitted.
3. **Cron Multi-Tenant Processing:** Triggering `/api/cron/briefings` processes events for *all* registered users in the database, not a `__system__` user.
4. **Cache Isolation:** Executing simultaneous requests for two different users does not result in User A's API keys or cached market data being served to User B.
5. **Security Scans:** `/api/dev/login` returns `404 Not Found` when `NODE_ENV=production`.

---

## 6. Open Questions for the Product Owner

1. **OAuth Providers:** The current `auth.ts` has placeholders for Google and GitHub. Should these be enabled by default for the SaaS edition?
2. **Open-Core Upgrade Path:** If a self-host user starts with `AUTH_MODE=legacy` (which bypasses auth and generates arbitrary user IDs), how do we migrate their local SQLite/Postgres data if they later choose to enable real NextAuth credentials on their self-hosted instance?
3. **Billing/Stripe:** The SaaS edition needs a billing engine. Should we integrate Stripe Checkout now, or wait until the RLS/multi-tenant foundations are merged?