# 09 — Open-Core Architecture Review (Handoff Prompt)

> **Type:** Read-only architectural audit of the entire HamaFX-Ai repository.
> **Goal:** Plan the conversion from a single-tenant personal app into a hybrid
> open-core product: an open-source self-hostable core (current single-password-gate
> model, unchanged for self-hosters) plus a hosted multi-tenant SaaS edition with
> real auth, billing (2Checkout/Verifone), and per-tenant data isolation — as ONE
> codebase with config/feature-flag boundaries, not two forks.
> **Rule:** Nothing was modified, run, or executed. Every claim cites a file path
> relative to the repo root. Findings from prompts 01–04 are referenced by filename,
> not duplicated here.

---

## 1. Context

### Current single-tenant state

HamaFX-Ai is a pnpm + Turborepo monorepo (Next.js 15 web app + Node.js worker)
that started as a personal single-user trading copilot and is mid-migration to
multi-user. The codebase already contains **substantial multi-tenant scaffolding**
that was added during "Phase 3" — but much of it is incomplete, untested, or
gated behind env vars that are never set in the self-host path.

**What already exists (partial multi-tenant foundation):**

- `organization` + `organization_member` tables in `packages/db/src/schema/auth.ts`
  (lines 66–88) — but no code creates organizations or memberships at runtime.
- `tenant_id` columns on **22 of 31** schema files (35 column references across
  `agent-opinions`, `alerts`, `audit`, `auth`, `bot-links`, `briefings`, `chat`,
  `daily-ai-spend`, `decision-signals`, `journal`, `memory`, `noise-control`,
  `portfolio`, `provider-tests`, `push`, `rate-limits`, `share`, `telemetry`,
  `tool-telemetry`). The 9 tables without `tenant_id` are correctly shared/global
  data: `calendar`, `candles-1m`, `cot`, `live-ticks`, `news`, `snapshots`,
  `symbol-catalog`, `intermarket-resonance`, `cron-runs`, `throttle`.
- `withTenantDb(tenantId, work)` in `packages/db/src/client.ts` (line 174) — sets
  the `app.current_tenant` GUC inside a transaction, but only when
  `HAMAFX_ENABLE_RLS=true`.
- `getAdminDb()` in `packages/db/src/client.ts` (line 200) — BYPASSRLS admin
  connection for cross-tenant worker/cron operations, falls back to `getDb()`
  when `ADMIN_DATABASE_URL` is unset (self-host).
- Per-tenant cache registry: `Map<string, Cache>` in
  `packages/data/src/cache/index.ts` (line 54) — `getDefaultCache(tenantId?)`
  isolates caches per tenant, falls back to `__global__` namespace when omitted.
- Per-tenant Vertex AI client cache in `packages/ai/src/model.ts` (line 98) —
  keyed by `${tenantId}|project|location|credentials}`.
- `HAMAFX_ENABLE_RLS`, `ADMIN_DATABASE_URL`, `SECRETS_VAULT_PROVIDER` env vars
  documented in `.env.example` and wired into `packages/db/src/client.ts` and
  `packages/shared/src/vault.ts`.

**What is still single-tenant (the gaps this review catalogues):**

- `AUTH_MODE=legacy` bypass in middleware injects `x-user-id: __system__` for all
  requests — the original single-password-gate model, retained for self-host.
- `__system__` user fallback in 10+ files across `packages/ai` and `packages/db`.
- Four feature flags (`MULTI_USER_ENABLED`, `BYOK_ENABLED`, `PER_USER_BRIEFINGS`,
  `UNLIMITED_SYMBOLS`) defined in `packages/shared/src/env.ts` but only
  `UNLIMITED_SYMBOLS` is actually read by application code
  (`packages/data/src/providers/biquote/filter.ts:33`). The other three are
  dead flags — defined, tested for parsing, never branched on.
- No `HAMAFX_EDITION` or equivalent env var exists. There is no concept of
  "self-host edition" vs "hosted edition" in the code — only a collection of
  individual flags and fallbacks.
- No billing code exists. `apps/web/test/billing-contract.test.ts` contains
  `it.todo()` stubs. `docs/BILLING-WEBHOOK-SAFETY-GATE.md` defines requirements
  but no implementation.
- Module-scope singletons (`_client`, `_sql`, `_adminClient`, `_adminSql`,
  `_authEnv`, `_serverEnv`, `_tenantCaches`, circuit-breaker `registry`,
  throttle `buckets`, `_vertexCache`) are safe for single-tenant but need
  audit for cross-tenant leakage in hosted mode.

### Target hybrid end state

One codebase, two editions, shipping from the same release:

| Aspect | Self-host edition | Hosted SaaS edition |
|--------|-------------------|---------------------|
| Auth | `AUTH_MODE=legacy` (single password gate, unchanged) | NextAuth v5 Credentials + OAuth, per-user sessions |
| Database | Single Postgres, no RLS | Shared Postgres, RLS enforced via `app.current_tenant` GUC |
| Tenancy | Single user (`__system__`), one implicit org | Many orgs, many users, `tenant_id` on all user-scoped tables |
| Billing | None | 2Checkout/Verifone subscriptions, webhook-driven |
| Admin tooling | Not needed | Per-tenant usage dashboards, admin panel, DLQ monitoring |
| Config | `HAMAFX_EDITION=self-host` (or unset) | `HAMAFX_EDITION=hosted` |
| AI / agent / tools / indicators / chart UI | Identical | Identical |

---

## 2. Findings — Single-Tenant Assumption Inventory

Every file below contains a hardcoded single-tenant assumption that must change
for the hosted multi-tenant edition. Files are grouped by layer (per
`docs/01-architecture.md`'s L1→L2→L3→L4 layering).

### L1 — Presentation (`apps/web/src/app`, `apps/web/src/components`)

| # | File | What needs to change |
|---|------|---------------------|
| F1 | `apps/web/src/middleware.ts:48–54` | `AUTH_MODE=legacy` branch injects `x-user-id: __system__` for all requests. In hosted edition this branch must be dead-code-eliminated or hard-blocked. The edition flag should gate this, not just `NODE_ENV`. |
| F2 | `apps/web/src/auth.config.ts:41` | `authorized()` callback allows legacy bypass when `AUTH_MODE=legacy && NODE_ENV !== 'production'`. Hosted edition must never enter this branch. Should be gated by `HAMAFX_EDITION` so it's impossible to accidentally enable in hosted mode. |
| F3 | `apps/web/src/app/(app)/layout.tsx:61` | `if (process.env.AUTH_MODE !== 'legacy')` gates the `auth()` call and onboarding redirect. In hosted edition this must always call `auth()`. The conditional is safe today but fragile — it should branch on edition, not on `AUTH_MODE` alone. |
| F4 | `apps/web/src/lib/env.ts:53,67–68` | `APP_PASSWORD` still in the `AuthEnvSchema` (optional). `_authEnv` and `_serverEnv` are module-scope singletons — safe in serverless (per-instance) but must not cache tenant-specific data. Currently they cache only global env, so no change needed, but document the constraint. |
| F5 | `apps/web/src/app/api/admin/test-alert-email/route.ts` | Admin routes use `withAuth()` but have no admin-role check — any authenticated user can trigger admin test actions. Hosted edition needs an `admin` role gate (the `users.role` column exists but is flat `'user'` for all). |
| F6 | `apps/web/src/app/api/admin/test-telegram/route.ts` | Same as F5 — no admin-role authorization. |

### L2 — Application (`packages/ai`, `packages/indicators`, `apps/worker/src/jobs`)

| # | File | What needs to change |
|---|------|---------------------|
| F7 | `packages/ai/src/persistence.ts:533,573` | `const userId = t.userId ?? '__system__'` — fallback to `__system__` when `userId` is null. In hosted mode this must throw, not fall back. The `__system__` user must not exist in hosted deployments. |
| F8 | `packages/ai/src/memory/memory-index.ts:130` | `const effectiveUserId = args.userId ?? '__system__'` — same pattern. Memory operations must require a real `userId` in hosted mode. |
| F9 | `packages/ai/src/memory/memory-index.ts:305,318` | `tenantId = args.tenantId ?? args.userId` and `withTenantDb(tenantId, ...)` — this is the correct pattern but only used in one function. Other memory functions (`memory-index.ts:90,125`) still use `getDb()` directly without tenant scoping. All memory reads/writes must go through `withTenantDb` in hosted mode. |
| F10 | `packages/ai/src/memory/thread-summary.ts:198` | Comment says "use real userId from tool context; no `__system__` fallback" — but verify the code actually does this. The comment suggests the fix was applied here but not in the sibling functions. |
| F11 | `packages/ai/src/planner.ts:144` | Same pattern — comment says no `__system__` fallback. Verify code matches. |
| F12 | `packages/ai/src/title.ts:136` | Same pattern — comment says no `__system__` fallback. Verify code matches. |
| F13 | `packages/ai/src/agent.ts:149` | `const db = getDb()` — the agent's main DB access uses the unscoped singleton, not `withTenantDb`. All user-scoped queries in the agent (thread load, message persist, telemetry) must route through `withTenantDb(userId, ...)` in hosted mode, or RLS must be trusted to enforce via the GUC (which requires the GUC to be set on the connection — `getDb()` does NOT set it). |
| F14 | `packages/ai/src/cost.ts` (multiple `getDb()` calls) | `dailySpendUsd(userId)` queries `chat_telemetry` with `.where(eq(userId, ...))` — application-level filter, not RLS. In hosted mode this must either use `withTenantDb` or trust RLS. Currently uses `getDb()` without GUC, so RLS would block the query (no `app.current_tenant` set). |
| F15 | `packages/ai/src/alerts/persistence.ts` (lines 51,89,111,126,173,183,198,256,263) | All alert CRUD uses `getDb()` with `.where(eq(userId, ...))` — application-level filter only. Same RLS gap as F14. |
| F16 | `packages/ai/src/alerts/evaluator.ts:318` | `const db = getDb()` — alert evaluation runs in the worker, which should use `getAdminDb()` for cross-tenant operations. Currently uses the unscoped singleton. |
| F17 | `packages/ai/src/briefings/generate.ts:76,164,335` | `MAX_DAILY_USD` read from `process.env` with fallback `5` — global budget, not per-tenant. Hosted edition needs per-tenant budgets (the `user_settings.maxDailyUsd` column exists and is used at line 171 in `agent.ts`, but `briefings/generate.ts` reads the env var directly, bypassing per-user settings). |
| F18 | `packages/ai/src/model.ts:89–115` | `_vertexCache` is a module-scope `Map` keyed by tenant — correct for isolation. But the cache is unbounded; in hosted mode with many tenants it will grow without eviction. Needs an LRU or TTL eviction policy. |
| F19 | `packages/ai/src/telegram/webhook.ts:290,345` | Comment says "resolve the linked user instead of using `__system__`" — this was fixed. Verify no remaining `__system__` paths in the Telegram webhook handler. |
| F20 | `apps/worker/src/index.ts:131` | `const db = getDb()` — worker uses the unscoped singleton. For shared data (candles, ticks, news) this is correct. For any user-scoped data the worker touches (briefings, weekly-review, alert evaluation), it must use `getAdminDb()` to bypass RLS, or iterate tenants explicitly. |
| F21 | `apps/worker/src/jobs/briefings.ts:40` | `const db = getDb()` — briefings job accesses user-scoped data. Must use `getAdminDb()` in hosted mode. |
| F22 | `apps/worker/src/jobs/weekly-review.ts:31` | Same as F21 — weekly review accesses user-scoped data. |
| F23 | `apps/worker/src/jobs/snapshots.ts:71,85` | Snapshots job accesses `candles_1m` (shared data) — `getDb()` is correct here. No change needed. |
| F24 | `apps/worker/src/jobs/resonance-sync.ts:71` | Resonance sync accesses `intermarket_resonance` (shared data) — `getDb()` is correct. No change needed. |
| F25 | `apps/worker/src/env.ts` | Worker env schema has no `HAMAFX_EDITION`, `HAMAFX_ENABLE_RLS`, or `ADMIN_DATABASE_URL` — it deliberately doesn't reuse `parseServerEnv`. The worker env must be extended to include edition/RLS/admin-URL vars for hosted mode. |

### L3 — Data Access (`packages/data`, `packages/db`)

| # | File | What needs to change |
|---|------|---------------------|
| F26 | `packages/db/src/client.ts:26–27` | `_client` / `_sql` module-scope singletons — one connection pool per Node process. In hosted mode this is shared across all tenants, which is correct (RLS enforces isolation via GUC). But `getDb()` returns the raw client without setting the GUC — callers must use `withTenantDb()` for user-scoped queries. Currently most callers use `getDb()` directly (see F13–F16). |
| F27 | `packages/db/src/client.ts:163` | `rlsEnabled` is a module-scope constant read once at boot from `HAMAFX_ENABLE_RLS`. This is fine — but it means `withTenantDb()` is a no-op in self-host mode (GUC never set), which is the correct behavior. The issue is that callers don't use `withTenantDb()` consistently (see F13–F16). |
| F28 | `packages/db/src/client.ts:188–189` | `_adminClient` / `_adminSql` singletons — correct for hosted mode (one BYPASSRLS pool). Falls back to `getDb()` when `ADMIN_DATABASE_URL` is unset, which is correct for self-host. |
| F29 | `packages/db/src/active-users.ts:59–69` | `getActiveUserIds()` falls back to `['__system__']` when no real users are found. In hosted mode this fallback must be removed — if there are no active users, the cron should skip, not process a phantom user. |
| F30 | `packages/data/src/cache/index.ts:54` | `_tenantCaches` is a module-scope `Map<string, Cache>` — unbounded. In hosted mode with many tenants this leaks memory. Needs eviction. The `__global__` fallback namespace is correct for self-host. |
| F31 | `packages/data/src/circuit-breaker.ts:24` | `registry = new Map<string, BreakerInternal>()` — keyed by provider name, not tenant. This is correct: circuit breaker state is per-provider (shared infrastructure), not per-tenant. No change needed. |
| F32 | `packages/data/src/cache/throttle.ts:55` | `buckets = new Map<string, Bucket>()` — keyed by provider name. Same as F31: correct for shared infrastructure. The Postgres-backed throttle (`provider_throttle` table) is the cross-instance source of truth. No change needed. |
| F33 | `packages/data/src/providers/biquote/filter.ts:33` | `UNLIMITED_SYMBOLS` env var bypasses symbol count limits. In hosted mode, symbol limits should be per-tenant (plan-based), not a global env var. This is the only feature flag actually read by application code. |

### L4 — Infrastructure / Config

| # | File | What needs to change |
|---|------|---------------------|
| F34 | `packages/shared/src/env.ts:208–222` | Four feature flags defined (`MULTI_USER_ENABLED`, `BYOK_ENABLED`, `PER_USER_BRIEFINGS`, `UNLIMITED_SYMBOLS`) but only `UNLIMITED_SYMBOLS` is read by app code. The other three are dead flags. Either wire them up or replace them with a single `HAMAFX_EDITION` var that implies their values. |
| F35 | `packages/shared/src/env.ts` (entire schema) | No `HAMAFX_EDITION` env var exists. The schema should add it: `z.enum(['self-host', 'hosted']).default('self-host')`. This becomes the top-level edition switch. |
| F36 | `packages/shared/src/vault.ts:72` | `AUTH_MODE` is in the vault secret list. `HAMAFX_EDITION` should be added if the hosted edition's config is vault-managed. |
| F37 | `.env.example` | Documents `AUTH_MODE`, `HAMAFX_ENABLE_RLS`, `ADMIN_DATABASE_URL`, `SECRETS_VAULT_PROVIDER` but has no `HAMAFX_EDITION`. The edition var should be added with clear documentation of which edition sets what. |
| F38 | `turbo.json` | `globalEnv` lists individual env vars but not `HAMAFX_EDITION`. Add it so Turbo invalidates caches when the edition changes. |
| F39 | `Dockerfile` / `Dockerfile.worker` | Dockerfiles build a single image. For open-core, the same image should work for both editions — the edition is selected at runtime via env var, not at build time. No structural change needed, but `HAMAFX_EDITION` should be documented in the Dockerfile comments. |
| F40 | `docker-compose.prod.yml` | Self-host Docker Compose sets `NEXTAUTH_SECRET`, `ENCRYPTION_SECRET` etc. but not `HAMAFX_EDITION`. Should set `HAMAFX_EDITION=self-host` explicitly (or leave unset, which defaults to self-host). |
| F41 | `apps/web/test/billing-contract.test.ts` | Billing test stubs exist (`it.todo`) — no billing implementation. This is the starting point for the hosted-only billing package. |
| F42 | `docs/BILLING-WEBHOOK-SAFETY-GATE.md` | Defines webhook safety requirements (signature verification, DLQ, idempotency, Sentry paging) but no code. This document should be referenced by the billing implementation PR. |
| F43 | `apps/web/src/app/api/cron/*/route.ts` (14 routes) | Cron routes authenticate via `CRON_SECRET` bearer token, not user sessions. This is correct — crons are system-level. But in hosted mode, cron routes that touch user-scoped data (briefings, weekly-review, evaluate-signals) must iterate tenants and use `getAdminDb()` or `withTenantDb(tenantId, ...)` per tenant. Currently they call `getActiveUserIds()` and use `getDb()`. |
| F44 | `apps/web/src/app/api/dev/login/route.ts` | Dev login route — must be hard-blocked in hosted production mode. Currently gated by `ENABLE_DEV_LOGIN` env var, which is separate from `HAMAFX_EDITION`. Should also check edition. |

### Cross-cutting: the `__system__` user

| # | File | Line(s) | Pattern |
|---|------|---------|---------|
| F45 | `apps/web/src/middleware.ts` | 51,54 | Injects `x-user-id: __system__` in legacy mode |
| F46 | `packages/ai/src/persistence.ts` | 533,573 | `userId ?? '__system__'` fallback in `recordTelemetry` and `saveMessage` |
| F47 | `packages/ai/src/memory/memory-index.ts` | 130 | `effectiveUserId = args.userId ?? '__system__'` |
| F48 | `packages/db/src/active-users.ts` | 59–69 | Returns `['__system__']` when no real users found |
| F49 | `apps/web/test/auth-helpers.ts` | 41,44 | Test helper sets `AUTH_MODE=legacy` and mocks `__system__` user |
| F50 | `apps/web/src/app/api/cron/briefings/route.ts` | 70–71 | Comment documents `__system__` fallback in legacy mode |
| F51 | `apps/web/src/app/api/cron/weekly-review/route.ts` | 38–39 | Same comment pattern |

**Summary:** The `__system__` user is the single-tenant identity. In hosted mode,
this user must not exist in the database, and every `?? '__system__'` fallback
must become a hard error. In self-host mode, `__system__` remains the sole user
identity and everything works as today.

---

## 3. Proposed Architecture

### 3.1 The config/flag boundary: `HAMAFX_EDITION`

Introduce a single top-level env var that controls edition behavior:

```bash
# .env.example
HAMAFX_EDITION=self-host   # default; open-source self-hostable core
# HAMAFX_EDITION=hosted    # hosted multi-tenant SaaS
```

Add to `packages/shared/src/env.ts`:

```typescript
HAMAFX_EDITION: z.enum(['self-host', 'hosted']).default('self-host'),
```

**Why a single var, not more flags?** The codebase already has 6+ independent
flags (`AUTH_MODE`, `MULTI_USER_ENABLED`, `BYOK_ENABLED`, `PER_USER_BRIEFINGS`,
`UNLIMITED_SYMBOLS`, `HAMAFX_ENABLE_RLS`) that are mostly dead or redundant. A
single edition var provides a clear mental model and makes it impossible to
create an invalid combination (e.g., `MULTI_USER_ENABLED=0` but `HAMAFX_ENABLE_RLS=true`).

**Derived flags:** `HAMAFX_EDITION=hosted` should imply:
- `AUTH_MODE` must NOT be `legacy` (hard-block in middleware).
- `HAMAFX_ENABLE_RLS` must be `true` (enforced at boot).
- `ADMIN_DATABASE_URL` must be set (enforced at boot).
- `MULTI_USER_ENABLED` = true (wired up where it's currently dead).
- `BYOK_ENABLED` = true (or plan-gated, see below).
- `UNLIMITED_SYMBOLS` = false (plan-gated per tenant, not global).
- `__system__` user must not exist; all `?? '__system__'` fallbacks throw.

**Where to branch on it:** Only in config/bootstrap code, not scattered
throughout the app:

| Module | What branches on `HAMAFX_EDITION` |
|--------|-----------------------------------|
| `packages/shared/src/env.ts` | Parse and validate the var; derive implied flags. |
| `apps/web/src/middleware.ts` | If `hosted`: hard-block `AUTH_MODE=legacy`; never inject `__system__`. |
| `apps/web/src/auth.config.ts` | If `hosted`: remove legacy bypass branch entirely. |
| `apps/web/src/lib/env.ts` | If `hosted`: require `ADMIN_DATABASE_URL`, `HAMAFX_ENABLE_RLS=true` at boot. |
| `packages/db/src/client.ts` | If `hosted`: `rlsEnabled` must be true; `getAdminDb()` must not fall back to `getDb()`. |
| `packages/ai/src/persistence.ts` | If `hosted`: `userId ?? '__system__'` → throw. |
| `packages/db/src/active-users.ts` | If `hosted`: remove `__system__` fallback. |

**What does NOT branch on it:** The agent, tools, indicators, chart UI, data
provider adapters, cache layer, circuit breaker, throttle. These are edition-
agnostic. The edition boundary is thin — it lives in bootstrap/config code and
in the auth/DB client layer, not in business logic.

### 3.2 Package restructuring

The current monorepo is a **good foundation** and needs minimal restructuring.

**Current packages:**
```
packages/shared    — env, schemas, errors, encryption, logger, vault
packages/db        — Drizzle client, schema, migrations, active-users
packages/data      — provider adapters, cache, circuit breaker, throttle
packages/ai        — agent, tools, persistence, memory, briefings, model routing
packages/indicators — technical indicator engine
packages/config    — prettier, eslint, tsconfig presets
packages/test-utils — test helpers
```

**Proposed new packages:**

```
packages/billing   — NEW (hosted-only). 2Checkout/Verifone client, webhook
                      handler, subscription/plan CRUD, invoice history, DLQ.
                      Depends on @hamafx/db, @hamafx/shared. Exported but
                      no-op when HAMAFX_EDITION=self-host.

packages/tenancy   — NEW. Organization CRUD, membership management, tenant
                      resolution middleware (maps userId → tenantId), plan
                      enforcement (symbol limits, rate limits, feature gates).
                      Depends on @hamafx/db, @hamafx/shared. In self-host
                      mode, exports a single-tenant shim that returns a
                      fixed tenantId and unlimited plan.

packages/admin     — NEW (hosted-only). Admin API routes, usage dashboards,
                      per-tenant export/delete, DLQ monitoring. Lives as
                      route handlers under apps/web/src/app/api/admin/ but
                      the business logic lives in this package.
```

**Why these packages and not more?**

- `packages/billing` isolates the 2Checkout/Verifone integration so it can be
  excluded from the self-host Docker image (or included but inert). It follows
  the PostHog `ee/` pattern (see §3.4).
- `packages/tenancy` centralizes the tenant resolution logic that is currently
  scattered across middleware, `lib/api.ts`, and ad-hoc `withTenantDb` calls.
  It gives both editions a single import point: `resolveTenant(req)` returns
  `{ tenantId, userId, plan }` in hosted mode, or `{ tenantId: '__global__',
  userId: '__system__', plan: 'unlimited' }` in self-host mode.
- `packages/admin` is thin — mostly route handlers that import from billing and
  tenancy. It could live entirely in `apps/web` but extracting it makes the
  hosted-only surface area explicit.

**No restructuring of existing packages is needed.** The layering rules in
`docs/01-architecture.md` (L1→L2→L3→L4, never import upward) already hold.
The new packages sit at L2/L3:

```
L1  apps/web (UI + routes)  →  imports packages/admin, packages/billing, packages/tenancy
L2  packages/ai, packages/indicators, packages/billing, packages/tenancy, packages/admin
L3  packages/data, packages/db
L4  packages/shared (config, schemas, errors)
```

### 3.3 Open-source vs. hosted-only split

| Component | Open-source (self-host) | Hosted-only | Rationale |
|-----------|------------------------|-------------|-----------|
| AI agent + 32 tools | ✅ Full | ✅ Full | Core value prop; open-source builds trust |
| Indicator engine | ✅ Full | ✅ Full | Pure math, no tenant sensitivity |
| Chart UI (lightweight-charts) | ✅ Full | ✅ Full | Frontend, no backend cost |
| Data provider adapters (BiQuote, Finnhub, etc.) | ✅ Full | ✅ Full | Users bring their own API keys |
| Cache layer + circuit breaker | ✅ Full | ✅ Full | Infrastructure, not a differentiator |
| Drizzle schema + migrations | ✅ Full | ✅ Full | Self-hosters need the DB schema |
| NextAuth Credentials provider | ✅ Full | ✅ Full | Self-hosters use it too |
| `AUTH_MODE=legacy` single-password gate | ✅ Full | ❌ Blocked | Self-host only; hosted must use real auth |
| `__system__` user + fallbacks | ✅ Full | ❌ Removed | Single-tenant identity; hosted must not use |
| Organization/member tables | ✅ Schema only | ✅ Full CRUD | Tables exist in schema; self-host creates one implicit org |
| RLS policies + GUC enforcement | ✅ Optional | ✅ Required | Self-host can skip RLS; hosted must enforce |
| `withTenantDb` / `getAdminDb` | ✅ No-op fallback | ✅ Active | Already designed this way |
| Billing (2Checkout/Verifone) | ❌ Not included | ✅ Full | Hosted-only; self-host has no billing |
| Subscription/plan management | ❌ Not included | ✅ Full | Hosted-only |
| Usage dashboards (per-tenant spend) | ❌ Not included | ✅ Full | Hosted-only; self-host has one user |
| Admin panel (user management, DLQ) | ❌ Not included | ✅ Full | Hosted-only |
| Secrets vault (GCP Secret Manager) | ❌ Not needed | ✅ Full | Hosted uses vault; self-host uses .env |
| Per-tenant export/delete rehearsal | ❌ Not needed | ✅ Full | Compliance (GDPR); hosted-only |
| OAuth providers (Google, GitHub) | Optional | ✅ Enabled | Self-hosters can enable if they want |

### 3.4 Should hosted-only parts live in the same repo behind a flag, or in a separate private package/repo?

**Recommendation: Same public repo, behind the `HAMAFX_EDITION` flag, with the
billing implementation in `packages/billing` as a clearly marked hosted-only
package.**

**Justification based on researched examples:**

1. **PostHog** (MIT core + `ee/` directory): Single repo. Enterprise features
   live in `posthog/ee/` and are license-key gated for self-hosted deployments,
   but the code is in the same public repo. This avoids merge conflicts and
   keeps the hosted and self-host builds from diverging. PostHog's approach
   works because the `ee/` code imports from the core but the core never
   imports from `ee/`. ([Source: posthog.com/docs/self-host/open-source/disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer))

2. **Supabase** (Apache-2.0): Single repo (`supabase/supabase`). All services
   (auth, REST, realtime, storage, edge functions) are in the same monorepo.
   The cloud edition adds managed infrastructure (pooling, backups, dashboards)
   that isn't in the repo, but the code that IS in the repo is identical for
   self-host and cloud. The boundary is infrastructure, not code.
   ([Source: supabase.com/docs/guides/self-hosting](https://supabase.com/docs/guides/self-hosting))

3. **Plausible** (AGPLv3 core): Single repo (`plausible/analytics`). The
   community edition and cloud edition share the same codebase. Cloud-only
   features are gated by feature flags and plan checks, not by separate repos.
   The AGPLv3 license prevents competitors from offering a hosted version
   without contributing back.
   ([Source: github.com/plausible/analytics](https://github.com/plausible/analytics))

**Why same-repo is better for HamaFX-Ai:**

- The codebase is small enough that a separate repo would create more overhead
  than isolation benefit.
- The hosted-only code (`packages/billing`, `packages/admin`) imports heavily
  from `@hamafx/db` and `@hamafx/shared` — a separate repo would need these
  as npm dependencies, complicating local development.
- The `HAMAFX_EDITION` flag already provides the runtime boundary. A compile-
  time boundary (separate package) adds complexity without meaningful
  protection — the code is visible in the public repo either way.
- PostHog's `ee/` pattern proves this works at scale.

**When to reconsider (separate private repo):** If the billing integration
contains proprietary business logic (custom pricing algorithms, partner
contracts) that should never be public. In that case, `packages/billing`
becomes a private npm package (`@hamafx/billing`) published from a private
repo, imported only in the hosted build. This is a business decision — see
§6.

### 3.5 License consideration

**Current license:** Apache-2.0 (`LICENSE` file, `package.json` `"license":
"Apache-2.0"`, README badge).

**Is Apache-2.0 appropriate for open-core?**

Apache-2.0 is a permissive license. It allows anyone to fork, modify, and even
host the software commercially without contributing back. This is fine for the
self-host core (maximizes adoption) but creates a risk for the hosted edition:
a competitor could fork the repo, add their own billing, and offer a competing
hosted service using the exact same code — without contributing any changes
upstream.

**Options:**

| License | Pros | Cons | Used by |
|---------|------|------|---------|
| **Apache-2.0** (current) | Maximum adoption; enterprise-friendly; no copyleft complexity | No protection against competing hosted services | Supabase |
| **AGPLv3** | Prevents competitors from hosting without contributing back; strong copyleft for SaaS | Some enterprises refuse AGPL; may reduce adoption | Plausible, Mastodon |
| **BSL (Business Source License)** | Allows non-compete clauses; converts to open source after N years | Complex; requires legal review; not OSI-approved | Sentry, HashiCorp |
| **Dual license** (Apache core + proprietary hosted) | Core stays permissive; hosted-only code is proprietary | Requires clean separation; two licenses in one repo is confusing | PostHog (MIT + ee license) |

**Recommendation:** Keep Apache-2.0 for the core (it's already set and
maximizes adoption for a new project). For the hosted-only packages
(`packages/billing`, `packages/admin`), add a proprietary license header or a
`LICENSE.hosted` file that restricts commercial use of those specific files.
This follows the PostHog model: MIT core + proprietary `ee/` directory.

If competitive protection becomes a priority later, consider switching the
core to AGPLv3 (like Plausible) — but this is a business decision that
affects adoption and should not be made lightly. See §6.

---

## 4. Step-by-Step Implementation Plan

> **You are the implementing agent.** Execute these steps in order. The app
> must keep working for the existing self-host use case at every step — no
> big-bang rewrite. After each step, run `pnpm test && pnpm typecheck` and
> verify the self-host Docker Compose path still boots.

### Step 1: Add `HAMAFX_EDITION` env var (config foundation)

1. Add `HAMAFX_EDITION: z.enum(['self-host', 'hosted']).default('self-host')` to
   `packages/shared/src/env.ts` in the `RuntimeEnv` schema.
2. Add `HAMAFX_EDITION` to `turbo.json` `globalEnv`.
3. Add `HAMAFX_EDITION=self-host` to `.env.example` with documentation.
4. Add `HAMAFX_EDITION` to `packages/shared/src/vault.ts` secret list.
5. Add a boot-time refinement: if `HAMAFX_EDITION=hosted`, require
   `HAMAFX_ENABLE_RLS=true` and `ADMIN_DATABASE_URL` to be set.
6. **Do not change any runtime behavior yet** — just parse and validate the var.

### Step 2: Wire `HAMAFX_EDITION` into the auth/middleware boundary

1. In `apps/web/src/middleware.ts`: if `HAMAFX_EDITION=hosted`, hard-block the
   `AUTH_MODE=legacy` branch (throw or return 500). The `__system__` injection
   must never run in hosted mode.
2. In `apps/web/src/auth.config.ts`: if `HAMAFX_EDITION=hosted`, remove the
   legacy bypass from the `authorized()` callback.
3. In `apps/web/src/app/(app)/layout.tsx`: if `HAMAFX_EDITION=hosted`, always
   call `auth()` (remove the `AUTH_MODE !== 'legacy'` conditional).
4. In `apps/web/src/lib/env.ts`: if `HAMAFX_EDITION=hosted`, emit a boot error
   if `AUTH_MODE=legacy` is set.
5. **Self-host path is unchanged** — `HAMAFX_EDITION` defaults to `self-host`,
   all existing behavior preserved.

### Step 3: Eliminate `__system__` fallbacks in hosted mode

1. In `packages/ai/src/persistence.ts:533,573`: replace
   `const userId = t.userId ?? '__system__'` with a conditional:
   if `HAMAFX_EDITION=hosted`, throw when `userId` is null. If `self-host`,
   keep the `__system__` fallback.
2. In `packages/ai/src/memory/memory-index.ts:130`: same pattern.
3. In `packages/db/src/active-users.ts:59–69`: if `HAMAFX_EDITION=hosted`,
   return `[]` when no active users are found (skip the cron). If `self-host`,
   keep the `__system__` fallback.
4. In `apps/web/src/app/api/cron/briefings/route.ts` and `weekly-review/route.ts`:
   if `HAMAFX_EDITION=hosted` and `getActiveUserIds()` returns `[]`, log and
   return 204 (no content). Do not process `__system__`.
5. **Self-host path is unchanged.**

### Step 4: Route user-scoped DB access through `withTenantDb` in hosted mode

1. Audit every `getDb()` call in `packages/ai/src/` that touches user-scoped
   tables (threads, messages, telemetry, alerts, memory, journal, portfolio,
   briefings, decision-signals). For each:
   - If `HAMAFX_EDITION=hosted`: wrap the query in `withTenantDb(userId, ...)`.
   - If `HAMAFX_EDITION=self-host`: keep `getDb()` (RLS is off, no GUC needed).
2. Start with `packages/ai/src/persistence.ts` (chat message persistence —
   highest traffic), then `packages/ai/src/cost.ts` (spend tracking — billing
   critical), then `packages/ai/src/alerts/persistence.ts`, then
   `packages/ai/src/memory/memory-index.ts`.
3. In `packages/ai/src/agent.ts:149`: the agent's main DB access must resolve
   the tenant from the request context and use `withTenantDb` in hosted mode.
4. **This is the largest step.** Do it incrementally — one file per PR, with
   tests. The self-host path is unchanged because `withTenantDb` is a no-op
   when `HAMAFX_ENABLE_RLS` is false.

### Step 5: Route worker/cron DB access through `getAdminDb` in hosted mode

1. In `apps/worker/src/env.ts`: add `HAMAFX_EDITION`, `HAMAFX_ENABLE_RLS`, and
   `ADMIN_DATABASE_URL` to the worker env schema.
2. In `apps/worker/src/index.ts:131`: if `HAMAFX_EDITION=hosted`, use
   `getAdminDb()` instead of `getDb()` for the main worker DB handle.
3. In `apps/worker/src/jobs/briefings.ts:40` and `weekly-review.ts:31`: same —
   use `getAdminDb()` in hosted mode.
4. In `apps/worker/src/jobs/snapshots.ts` and `resonance-sync.ts`: these touch
   only shared tables (candles, resonance) — `getDb()` is correct. No change.
5. In `apps/worker/src/alerts/evaluator.ts:318`: use `getAdminDb()` in hosted
   mode (alert evaluation runs cross-tenant in the worker).
6. **Self-host path is unchanged** — `getAdminDb()` falls back to `getDb()`
   when `ADMIN_DATABASE_URL` is unset.

### Step 6: Create `packages/tenancy`

1. Create `packages/tenancy` with:
   - `resolveTenant(req: Request): { tenantId, userId, plan }` — reads
     `x-user-id` header, looks up the user's org membership, returns the
     tenant context. In self-host mode, returns
     `{ tenantId: '__global__', userId: '__system__', plan: 'unlimited' }`.
   - `assertPlan(tenant, feature)` — plan-gated feature checks (symbol limits,
     BYOK, per-user briefings). In self-host mode, always returns true.
   - `createOrganization(name, ownerId)`, `addMember(orgId, userId, role)` —
     org CRUD. In self-host mode, no-ops (one implicit org).
2. Wire `resolveTenant` into `apps/web/src/lib/api.ts::withAuth` so every
   route handler receives `{ user, tenant }` in its context.
3. **Self-host path is unchanged** — `resolveTenant` returns the shim.

### Step 7: Create `packages/billing` (hosted-only)

1. Create `packages/billing` with:
   - 2Checkout/Verifone API client (checkout session creation, subscription
     CRUD, invoice listing).
   - Webhook handler with signature verification, idempotency table, DLQ —
     per `docs/BILLING-WEBHOOK-SAFETY-GATE.md`.
   - Subscription/plan schema (add `subscriptions` and `invoices` tables to
     `packages/db/src/schema/` with `tenant_id` columns).
   - Plan enforcement: `getPlan(tenantId)`, `changePlan(tenantId, newPlan,
     prorate)`.
2. Export a no-op shim when `HAMAFX_EDITION=self-host` — all functions return
   `{ enabled: false }` or throw `BillingNotEnabledError`.
3. Add billing route handlers under `apps/web/src/app/api/billing/` that
   import from `packages/billing`.
4. Wire the billing-contract tests (`apps/web/test/billing-contract.test.ts`)
   to run only when `HAMAFX_EDITION=hosted`.
5. **Self-host path is unchanged** — billing routes return 404 or
   `{ enabled: false }`.

### Step 8: Create `packages/admin` (hosted-only)

1. Create `packages/admin` with:
   - Admin role check (`requireAdmin(req)`) — checks `users.role === 'admin'`.
   - Per-tenant usage dashboard data queries (spend, message count, active
     threads, storage).
   - Per-tenant export/delete (GDPR compliance rehearsal).
   - DLQ monitoring queries.
2. Add admin route handlers under `apps/web/src/app/api/admin/` that import
   from `packages/admin`. Replace the existing test-alert routes with
   admin-gated versions.
3. **Self-host path is unchanged** — admin routes return 404.

### Step 9: Add per-tenant plan enforcement

1. In `packages/data/src/providers/biquote/filter.ts:33`: replace the global
   `UNLIMITED_SYMBOLS` check with a per-tenant plan check via
   `packages/tenancy::assertPlan(tenant, 'unlimited_symbols')`.
2. Wire `MULTI_USER_ENABLED`, `BYOK_ENABLED`, `PER_USER_BRIEFINGS` to derive
   from `HAMAFX_EDITION` (hosted implies all true) or from per-tenant plan
   checks. Remove the dead flags from `packages/shared/src/env.ts` or mark
   them as deprecated aliases.
3. **Self-host path is unchanged** — all plan checks return true.

### Step 10: Add cache eviction for hosted mode

1. In `packages/data/src/cache/index.ts`: add an LRU eviction policy to
   `_tenantCaches` when the map exceeds a configurable max size (e.g., 1000
   tenants). Evict the least-recently-accessed tenant cache.
2. In `packages/ai/src/model.ts`: add the same LRU policy to `_vertexCache`.
3. **Self-host path is unchanged** — with one tenant, eviction never triggers.

### Step 11: Update Docker and deployment configs

1. In `docker-compose.prod.yml`: add `HAMAFX_EDITION=self-host` to the web
   and worker environment. Document that self-hosters never need to change
   this.
2. In `Dockerfile` and `Dockerfile.worker`: add a comment documenting that
   the same image works for both editions — the edition is selected at
   runtime via `HAMAFX_EDITION`.
3. Create a `docker-compose.hosted.yml` override for the hosted edition that
   sets `HAMAFX_EDITION=hosted`, `HAMAFX_ENABLE_RLS=true`, and
   `ADMIN_DATABASE_URL`. This is for internal use only, not published.
4. Update `docs/11-self-hosting.md` to mention `HAMAFX_EDITION` (self-hosters
   can ignore it — it defaults correctly).

### Step 12: Update documentation

1. Update `docs/01-architecture.md` deployment modes table to include the
   edition dimension.
2. Add a new `docs/12-editions.md` (or update `docs/11-self-hosting.md`)
   documenting the open-core model, what's open vs. hosted-only, and the
   `HAMAFX_EDITION` flag.
3. Update `AGENTS.md` to mention the edition boundary in the architecture
   section.
4. Update `README.md` to clarify the open-core model.

---

## 5. Acceptance Criteria

### Self-host mode still works unchanged

- [ ] `HAMAFX_EDITION` unset or `self-host` → all existing behavior preserved.
- [ ] `AUTH_MODE=legacy` in dev → middleware injects `__system__`, all routes
      work as today.
- [ ] `docker compose -f docker-compose.prod.yml up -d` → app boots, registers,
      chats, no errors about missing `ADMIN_DATABASE_URL` or RLS.
- [ ] `pnpm test` passes with no new failures.
- [ ] `pnpm typecheck` passes.
- [ ] No `packages/billing` or `packages/admin` code executes in self-host
      mode (billing routes return 404 or `{ enabled: false }`).
- [ ] `__system__` user exists in the DB, all `?? '__system__'` fallbacks work.
- [ ] `withTenantDb()` is a no-op (GUC not set), `getAdminDb()` falls back to
      `getDb()`.

### Hosted mode correctly isolates tenants (after 01/02/03/04 fixes land)

- [ ] `HAMAFX_EDITION=hosted` → boot fails fast if `HAMAFX_ENABLE_RLS != true`
      or `ADMIN_DATABASE_URL` is unset.
- [ ] `AUTH_MODE=legacy` → boot fails fast or middleware hard-blocks (no
      `__system__` injection).
- [ ] `__system__` user does not exist in the DB; all `?? '__system__'`
      fallbacks throw.
- [ ] Every user-scoped DB query in `packages/ai` goes through
      `withTenantDb(userId, ...)` — verify by grepping for `getDb()` calls
      that touch user-scoped tables and confirming none remain unscoped.
- [ ] Worker uses `getAdminDb()` for user-scoped jobs (briefings, weekly-
      review, alert evaluation) and `getDb()` for shared data (candles, ticks,
      news).
- [ ] `getActiveUserIds()` returns real user IDs, never `__system__`.
- [ ] Per-tenant cache isolation: `getDefaultCache('tenant-A')` and
      `getDefaultCache('tenant-B')` return different `Cache` instances with
      no key overlap.
- [ ] RLS policies enforce: a query with `app.current_tenant = 'tenant-A'`
      cannot read rows where `tenant_id = 'tenant-B'`.
- [ ] Billing webhook: invalid signature → 401 + Sentry event; processing
      error → DLQ entry + Sentry event; duplicate event → idempotent (no
      double processing). (Per `docs/BILLING-WEBHOOK-SAFETY-GATE.md`.)
- [ ] Admin routes: non-admin user → 403; admin user → access granted.
- [ ] Per-tenant plan enforcement: free-tier tenant hits symbol limit;
      unlimited-tier tenant does not.
- [ ] `_tenantCaches` and `_vertexCache` evict entries when exceeding max
      size (no unbounded memory growth).

---

## 6. Open Questions for the Human Owner

### Q1: License choice — keep Apache-2.0 or switch to AGPLv3?

**Context:** The repo is currently Apache-2.0. This is permissive — anyone can
fork and host a competing SaaS without contributing back. AGPLv3 (like
Plausible) would prevent this but may reduce enterprise adoption. BSL (like
Sentry/HashiCorp) offers non-compete clauses but isn't OSI-approved.

**This is a business call, not a technical one.** The code structure works
with any license. But:
- If you want maximum protection against competitors: switch core to AGPLv3,
  keep hosted-only packages proprietary.
- If you want maximum adoption and trust: keep Apache-2.0, accept the risk.
- If you want a middle ground: keep Apache-2.0 for core, add a proprietary
  license for `packages/billing` and `packages/admin` (PostHog model).

### Q2: Should `packages/billing` be in the public repo or a private package?

**Context:** The recommendation in §3.4 is same-repo behind a flag (PostHog
`ee/` pattern). But if the billing integration contains proprietary business
logic (custom pricing, partner contracts, Verifone merchant-specific config),
it should be in a private package (`@hamafx/billing`) published from a
private repo.

**This is a business call.** Considerations:
- Same-repo: simpler development, code is public, no competitive protection
  for billing logic.
- Private package: billing code is hidden, but you maintain two repos and
  a publishing pipeline.

### Q3: Is the tenant model "user = tenant" or "org = tenant"?

**Context:** The schema has both `users.userId` and `tenant_id` columns. The
`organization` and `organization_member` tables exist but are unused. The
question is whether a "tenant" is a single user (1:1) or an organization
that can have multiple members (1:N).

- If user = tenant: `tenant_id` can default to `userId`, org tables are
  unnecessary, billing is per-user.
- If org = tenant: users belong to orgs, `tenant_id` = org ID, billing is
  per-org with seats, shared workspaces.

**The `docs/review/02-database-rls-scalability-review.md` F2 finding flags
this as a decision that must be made before RLS design.** The current schema
supports both models (org tables exist, `tenant_id` defaults to
`current_setting('app.current_tenant')`), but the application code treats
`userId` as the tenant in most places (`withTenantDb(userId, ...)` in
`memory-index.ts:305`).

### Q4: 2Checkout/Verifone vs. Stripe — which is confirmed?

**Context:** The audit prompts reference 2Checkout/Verifone. The
`docs/review/HamaFX-Ai   Implementation Orchestration Plan.md` (lines 517–541)
notes an unresolved conflict: some docs reference Stripe, others Verifone.
Iraq merchant eligibility with Verifone is unconfirmed.

**This must be resolved before Step 7 (billing implementation).** The
package structure (`packages/billing`) is the same either way, but the API
client, webhook format, and test fixtures differ.

### Q5: Should self-host mode support multiple users (without orgs)?

**Context:** The `MULTI_USER_ENABLED` flag exists but is dead code. The
self-hosting guide (`docs/11-self-hosting.md`) says "deploy your own
multi-tenant clone" — but the self-host edition is supposed to retain the
single-password-gate model. Should self-hosters be able to enable multi-user
registration (without billing/orgs), or is self-host always single-user?

### Q6: Should the hosted edition's Docker image be the same as the self-host image?

**Context:** The current Dockerfile builds one image. If `packages/billing`
and `packages/admin` are in the public repo, the self-host image includes
hosted-only code (inert but present). If they're private packages, the
self-host image can't include them. This is tied to Q2.

---

## Appendix: Researched Examples (2026)

### Supabase — Apache-2.0, single repo, infrastructure boundary

Supabase is Apache-2.0 and ships as a single Docker Compose stack for self-
hosting. The cloud edition runs the same code but adds managed infrastructure
(Supavisor pooling, automated backups, dashboard, CDN). The code boundary is
minimal — the difference is operational, not code-level. Self-host and cloud
are designed to be interchangeable.

**Source:** [supabase.com/docs/guides/self-hosting](https://supabase.com/docs/guides/self-hosting)

**Relevance to HamaFX-Ai:** Supabase proves that a permissive license
(Apache-2.0) works for open-core if the hosted value is operational (managed
infrastructure) rather than code-level features. HamaFX-Ai's hosted value is
partly operational (managed Postgres, VM) and partly code-level (billing,
admin) — so Apache-2.0 alone may not be sufficient.

### PostHog — MIT core + proprietary `ee/` directory, license-key gated

PostHog is MIT-licensed for the core. Enterprise features live in `posthog/ee/`
in the same repo. Self-hosted deployments can use `ee/` features with a
license key; without a key, the features are inert. The cloud edition has all
features enabled. The `ee/` code imports from core but core never imports from
`ee/`.

**Source:** [posthog.com/docs/self-host/open-source/disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer)

**Relevance to HamaFX-Ai:** This is the closest model. `packages/billing` and
`packages/admin` are the `ee/` equivalent — they import from `@hamafx/db` and
`@hamafx/shared` but nothing in the core imports from them. The
`HAMAFX_EDITION` flag replaces the license-key mechanism (simpler for a
hosted-only model where self-hosters don't need the features at all).

### Plausible — AGPLv3 core, MIT tracker, single repo, feature-flag gated

Plausible is AGPLv3 for the community edition (self-hosted) and MIT for the
tracker script (to avoid AGPL contagion on user websites). Cloud-only features
are gated by feature flags and plan checks in the same codebase. The AGPLv3
license prevents competitors from offering a hosted Plausible without
contributing back.

**Source:** [github.com/plausible/analytics](https://github.com/plausible/analytics)

**Relevance to HamaFX-Ai:** If competitive protection becomes important,
Plausible's AGPLv3 model is the alternative to Apache-2.0. The feature-flag
gating approach (same as PostHog) confirms that the `HAMAFX_EDITION` pattern
is industry-standard.

### Open-core best practices (2026 industry guidance)

A 2026 DEV Community guide on monetizing open source recommends:
- **Clear separation:** Core (MIT/Apache) + Pro/Enterprise layer, no circular
  dependencies. Pro extends Core, Core never imports Pro.
- **License gating:** Offline license validation using asymmetric crypto for
  self-hosted Pro features. For hosted-only features, a runtime flag suffices.
- **Pricing:** Seat-based or usage-based subscriptions for SaaS; one-time
  perpetual for self-hosted Pro.

**Source:** [dev.to — How to Monetize an Open Source Project](https://dev.to/whoffagents/how-to-monetize-an-open-source-project-freemium-open-core-and-license-gating-4il6)

**Relevance:** Confirms the proposed architecture: `packages/billing` and
`packages/admin` extend the core without circular dependencies, gated by
`HAMAFX_EDITION` at runtime.
