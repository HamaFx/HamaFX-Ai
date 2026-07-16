# HamaFX-AI — Reliability & Performance Hardening — Implementation Prompt Plan

> **AUDIENCE: An autonomous AI coding agent.** This file is a machine-actionable
> work-order spec, not human documentation. Every task is self-contained and
> deterministic. Do not summarize; execute. Do not improvise scope; implement
> exactly what each work order specifies and nothing more.

---

## 0. HOW TO CONSUME THIS PLAN (agent operating instructions)

0.1 Read Sections 1–4 fully before touching code. They define repo facts,
    protected invariants, and the per-task verification loop.

0.2 Execute work orders in the order given by Section 6 (dependency graph).
    Do **one work order at a time**. Never batch unrelated work orders into a
    single commit.

0.3 For **every** work order, run this loop:
    1. Re-read the exact files named in the work order and confirm the
       "Evidence" still matches the current code (line numbers may have
       drifted — match on the quoted code, not the line number).
    2. If the Evidence no longer matches (someone already fixed it), mark the
       work order `ALREADY-RESOLVED` and skip it. Do not re-implement.
    3. Implement the "Required change" precisely.
    4. Run the work order's "Local verification" commands.
    5. Run the global verification suite (Section 4.2).
    6. Only if all pass, produce the commit using the "Commit" line verbatim.
    7. Append a status line to `/RELIABILITY_HARDENING_LOG.md` (create if
       missing): `<WORK-ORDER-ID> | <DONE|ALREADY-RESOLVED|BLOCKED> | <commit sha> | <notes>`.

0.4 **CRITICAL RULE — trust the code, not the docs.** This repository's
    Markdown docs (`README.md`, `AGENTS.md`, `docs/**`, `HAMAFX_AI_AGENT_HARDENING_PLAN.md`,
    inline comments) are known to drift from reality. Several findings below
    exist *because* a doc/comment claims a behavior the code does not implement.
    Before relying on any documented behavior, verify it in source. When a
    comment and the code disagree, the code is ground truth; fix the code first,
    then correct the comment in the same commit.

0.5 **Do no harm.** These changes must not alter product behavior that users
    rely on, must not break passing tests, and must not regress the invariants
    in Section 3. If a required change conflicts with a Section 3 invariant,
    stop and mark the work order `BLOCKED` with an explanation.

0.6 If a work order cannot be completed within its stated acceptance criteria
    without expanding scope, mark it `BLOCKED` and move on. Do not partially
    implement in a way that leaves the build red.

---

## 1. REPOSITORY FACTS (verified against source, not docs)

- **Monorepo**: pnpm workspaces + Turborepo. Package manager pinned
  `pnpm@9.15.4`. Node `>=20.11` (`.nvmrc` = `20`).
- **Apps**: `apps/web` (Next.js 15, App Router; resolved `next@15.5.18`,
  `react@19`), `apps/worker` (persistent Node process, systemd + Docker).
- **Packages**: `@hamafx/ai` (~36k LOC), `@hamafx/data` (market-data providers,
  cache, throttle, failover, circuit-breaker), `@hamafx/db` (Drizzle + postgres-js,
  51 migrations under `packages/db/drizzle/`), `@hamafx/shared`,
  `@hamafx/indicators`, `@hamafx/config`.
- **DB**: Postgres (Supabase transaction pooler in prod; PGlite in dev/tests).
  Drizzle ORM `0.38.3`, `postgres` `3.4.5`. `prepare: false` (pooler requirement).
- **AI**: Vercel AI SDK v5 (`ai@^5`, `@ai-sdk/anthropic`, `@ai-sdk/google`,
  `@ai-sdk/google-vertex`, `@ai-sdk/openai-compatible`). BYOK (bring-your-own-key)
  per user. Single-agent (`agent.ts`) and multi-agent (`multi-agent/orchestrator.ts`).
- **Runtime split**: `HAMAFX_RUNTIME=worker` distinguishes worker from web for
  pool sizing / statement timeouts in `packages/db/src/client.ts`.
- **Test tooling**: Vitest (workspace config `vitest.workspace.ts`), Playwright
  (web e2e). Turbo tasks: `build`, `lint`, `typecheck`, `test`.

### 1.1 Commands (run from repo root unless noted)
```
pnpm install --frozen-lockfile      # deps
pnpm typecheck                      # turbo run typecheck (all packages)
pnpm lint                           # turbo run lint
pnpm test                           # turbo run test (vitest, all)
pnpm --filter @hamafx/data test     # scope to one package
pnpm --filter @hamafx/ai test
pnpm --filter @hamafx/db test
pnpm --filter @hamafx/web test
```

---

## 2. WHAT THIS PLAN CHANGES (scope summary)

This plan hardens **reliability, rate-limit correctness, quota safety,
memory stability, data-retention, and a few security footguns**, plus targeted
cleanups. It is grouped into phases:

- **Phase A — Rate limits & quota correctness** (RL-1…RL-5)
- **Phase B — Memory & runtime stability** (PERF-1, PERF-2, PERF-7)
- **Phase C — DB durability & retention** (DB-1, DB-2)
- **Phase D — AI cost & throughput** (PERF-4, PERF-5, PERF-6, RL-3, RL-4)
- **Phase E — Security hardening** (SEC-1…SEC-4)
- **Phase F — Cleanups & correctness** (CLEAN-1…CLEAN-3, PERF-8)
- **Phase G — Dependency hygiene** (UPG-1)

Severity legend: **P0** = correctness/cost/outage risk at scale; **P1** = strong
reliability/cost win; **P2** = hygiene / defense-in-depth.

---

## 3. PROTECTED INVARIANTS — DO NOT REGRESS (verified healthy)

These were inspected and are **correct**. Do not "improve", refactor, or touch
them except where a work order explicitly says so. If a change would alter any
of these, it is out of scope.

- **INV-1** `tryReserveBudget` in `packages/ai/src/cost.ts` is atomic via a
  single conditional `INSERT … ON CONFLICT DO UPDATE … WHERE` and correctly
  normalizes both postgres-js (array) and PGlite (`.rows`) result shapes. Keep
  the dual-shape normalization pattern everywhere it appears.
- **INV-2** `withRateLimit` in `packages/db/src/rate-limit.ts` is atomic and
  counts rejected attempts. Keep semantics: it increments even when rejecting.
- **INV-3** Vector search is correctly indexed: `news_embeddings` and
  `memory_embeddings` both have **HNSW** indexes with `vector_cosine_ops`
  (schema + migrations 0000/0004/0047). Do not drop or alter these.
- **INV-4** TypeScript config (`tsconfig.base.json`) is strict:
  `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`. All new code MUST compile
  under these without new `as any`, `@ts-ignore`, or `eslint-disable`.
- **INV-5** Next resolves to `15.5.18` — **not** vulnerable to CVE-2025-29927
  (middleware auth bypass). Do NOT add a "Next.js CVE" upgrade task; it is
  already patched. (This is an example of verifying the lockfile, not assuming.)
- **INV-6** Chat hot-path indexes exist: `chat_messages(thread_id, created_at)`
  composite, `chat_threads(user_id)`, tenant-id indexes. Do not remove.
- **INV-7** Migration journal integrity: `packages/db/drizzle/meta/_journal.json`
  has exactly 51 entries matching 51 `.sql` files. **Never edit an existing
  applied migration file in place** (history shows migration `0050` was once
  overwritten and had to be restored — do not repeat this). All schema changes
  ship as **new** sequentially-numbered migrations generated by drizzle-kit.

---

## 4. GLOBAL EXECUTION PROTOCOL

### 4.1 Change discipline
- One work order → one focused commit. Conventional commit prefix `fix:` /
  `perf:` / `chore:` / `refactor:` as indicated per task.
- Never modify an existing migration file. Generate new migrations only.
- Never weaken `tsconfig` strictness or add lint suppressions to make a change
  compile. Fix the types instead.
- Preserve public exports and function signatures unless a work order says to
  change them. If a signature must change, update all call sites in the same
  commit and keep tests green.
- Do not reformat unrelated files. Keep diffs minimal.

### 4.2 Global verification suite (run after every work order)
```
pnpm typecheck && pnpm lint && pnpm test
```
All three must pass. If a work order adds/changes a migration, additionally run:
```
pnpm --filter @hamafx/db test        # includes full-migration-chain tests
```
If a work order touches web routes, additionally run the route/unit tests:
```
pnpm --filter @hamafx/web test
```
A work order is **DONE** only when the global suite is green and its own
"Acceptance criteria" are all satisfied.

### 4.3 Behavior-preservation rule
For each work order, before committing, explicitly confirm: "Does this change
alter any externally observable behavior for an existing, correctly-configured
deployment?" If yes and the work order did not authorize it, revert and
re-scope. Default new behavior behind env flags where noted so existing
deployments are unaffected until opted in.

---

## 5. WORK ORDERS

Each work order uses this schema:
**ID · Severity · Category** — Title
**Files** · **Evidence** · **Root cause** · **Required change** · **Steps** ·
**Acceptance criteria** · **Local verification** · **Regression guardrails** ·
**Commit**

---

### PHASE A — RATE LIMITS & QUOTA CORRECTNESS

---

#### RL-1 · P0 · rate-limits — Make cross-instance provider throttle the default in multi-instance deployments

**Files**
- `packages/data/src/cache/throttle.ts`
- `.env.example` (line with `THROTTLE_BACKEND=`)
- `apps/web/src/lib/env.ts` (env parsing), `apps/worker/src/env.ts`

**Evidence**
- `throttle.ts` `tryReserve()` / `noteBackoff()` branch on
  `process.env.THROTTLE_BACKEND !== 'postgres'`; when not `postgres` they use a
  **module-scope in-memory `Map<string, Bucket>`** (`const buckets = new Map…`).
- `.env.example` ships `THROTTLE_BACKEND=` (empty) → in-memory is the **default**.
- Web runs on Vercel (many concurrent function instances) and the worker is a
  separate process. In-memory buckets are **per-instance**, so N instances each
  admit up to the full `limit`, and the aggregate egress to each upstream
  provider is ~N× the intended cap.

**Root cause**
Rate limiting state is process-local by default; provider caps are global.

**Required change**
Do NOT change the algorithm. Make the **postgres** backend the effective default
for multi-instance runtimes while preserving the in-memory path for
tests/self-host single-process mode.
1. Introduce a resolver `resolveThrottleBackend(): 'postgres' | 'memory'` in
   `throttle.ts`:
   - Return `'memory'` when `process.env.NODE_ENV === 'test'`.
   - Return `'postgres'` when `THROTTLE_BACKEND === 'postgres'`.
   - Return `'memory'` when `THROTTLE_BACKEND === 'memory'` (explicit opt-out).
   - **Default** (unset): return `'postgres'` when `process.env.VERCEL` is set
     OR `process.env.HAMAFX_RUNTIME === 'worker'` (i.e., a real deployment);
     otherwise `'memory'`.
2. Replace the two inline `process.env.THROTTLE_BACKEND !== 'postgres'` checks
   with `resolveThrottleBackend() === 'memory'`.
3. Update `.env.example` comment to state the new default and that `memory`
   disables cross-instance sharing.

**Steps**
- Add the resolver, wire both functions, keep the exact SQL upsert untouched.
- Keep `_resetThrottle()` clearing the in-memory map (tests rely on it).

**Acceptance criteria**
- With `NODE_ENV=test`, throttle still uses in-memory (existing throttle tests
  pass unchanged).
- With `VERCEL=1` and `THROTTLE_BACKEND` unset, `resolveThrottleBackend()` returns
  `'postgres'` (add a unit test asserting this).
- No behavior change when `THROTTLE_BACKEND=postgres` is already set.

**Local verification**
```
pnpm --filter @hamafx/data test
```
Add `packages/data/src/cache/throttle.test.ts` cases for the resolver matrix.

**Regression guardrails**
- The postgres path already exists and is covered; only default selection
  changes. Ensure no import cycle is introduced by reading env at call time
  (do not read env at module top-level).

**Commit**: `fix(data): default provider throttle to postgres backend on Vercel/worker`

---

#### RL-2 · P0 · rate-limits — Back TwelveData daily quota with shared storage

**Files**
- `packages/data/src/providers/twelvedata/rest.ts`
- (new migration) `packages/db/drizzle/00XX_provider_daily_quota.sql`
- `packages/db/src/schema/throttle.ts` (add table) + `schema/index.ts` export

**Evidence**
- `twelvedata/rest.ts` tracks daily usage with **module globals**:
  `let dailyCount = 0; let dailyResetAt = Date.now() + 24*60*60*1000;` and
  `checkDailyQuota()` compares/increments them in-process.
- Free tier is 800/day; buffer at 780. Because state is per-instance and lost on
  cold start, the **real** daily total across all Vercel instances can far exceed
  800 → hard provider lockout for all users sharing that key.
- `provider_throttle` table (`packages/db/src/schema/throttle.ts`) is keyed by
  `provider` with a per-window `count` only — there is **no daily counter**.

**Root cause**
Daily quota is a global budget tracked in local memory.

**Required change**
Add a shared daily counter and use it for the daily gate. Reuse the same
dual-backend pattern as `throttle.ts` (in-memory for tests/self-host, postgres
otherwise via `resolveThrottleBackend()` from RL-1, so land RL-1 first).
1. New table `provider_daily_quota(provider text, day date, count int, primary key(provider, day))`.
   Generate via drizzle-kit (`pnpm --filter @hamafx/db drizzle-kit generate`),
   do not hand-edit prior migrations.
2. Add `tryReserveDaily(provider, cap, buffer)` and increment-on-success helpers
   in `packages/data/src/cache/throttle.ts` (co-located with per-minute logic),
   using atomic upsert:
   `INSERT … ON CONFLICT (provider, day) DO UPDATE SET count = count + 1 WHERE count < ${cap - buffer} RETURNING count`.
3. Replace `checkDailyQuota()` usage in `twelvedata/rest.ts` with the shared
   helper. Keep the same 800/780 numbers. Keep the in-memory fallback for tests.
4. Increment the daily counter **only after a successful upstream response**
   (mirror current placement: after `res.ok` parse succeeds).

**Acceptance criteria**
- Daily gate works across processes when postgres backend is active.
- Tests (in-memory backend) preserve current behavior; add a test proving the
  upsert stops at `cap - buffer`.
- New migration applies cleanly in `full-migration-chain` test.

**Local verification**
```
pnpm --filter @hamafx/db test && pnpm --filter @hamafx/data test
```

**Regression guardrails**
- Old row cleanup for `provider_daily_quota` is handled by DB-1's retention cron
  (delete rows older than 3 days). Do not leave it unbounded.

**Commit**: `fix(data): back twelvedata daily quota with shared provider_daily_quota table`

---

#### RL-3 · P1 · rate-limits — Use LLM rate-limit headers to gate/delay, not just log

**Files**
- `packages/ai/src/rate-limits.ts` (`extractRateLimits`)
- `packages/ai/src/agent.ts` (call site ~line 603) and
  `packages/ai/src/model.ts` (~line 374)
- (new) `packages/ai/src/llm-throttle.ts`

**Evidence**
- `extractRateLimits(headers)` parses OpenAI/Anthropic/Groq remaining-requests /
  remaining-tokens / reset headers correctly.
- The only consumers store the snapshot into `provider_tests`
  (`agent.ts`: `db.delete(providerTests)…db.insert(providerTests)…`) — pure
  **diagnostics**. Nothing throttles or delays the next call based on
  `remainingRequests`/`remainingTokens`/`reset*`.

**Root cause**
Rate-limit signals are observed but never fed back into scheduling.

**Required change**
Add a lightweight, per-(provider,userKeyHash) **soft governor** that records the
last-seen remaining/reset and, before a call, if `remainingRequests <= floor` or
`remainingTokens <= tokenFloor`, waits until `reset*` (bounded, e.g. max 5s) or
returns a typed `RateLimitDeferred` the caller converts into the existing
fallback path. Keep it in-memory (per-instance) — this is a smoothing
optimization, not a correctness guarantee, so per-instance is acceptable and
avoids DB writes on the hot path.
1. New `llm-throttle.ts`: `noteLlmRateLimit(key, RateLimitData)` and
   `awaitLlmHeadroom(key, opts): Promise<void>` (resolves immediately if headroom
   fine; otherwise sleeps up to a small cap honoring `reset*`).
2. At the call sites that already compute `extractRateLimits`, call
   `noteLlmRateLimit`. Immediately before the model call in `agent.ts` and each
   specialist call in `base-agent.ts`, `await awaitLlmHeadroom(key, {signal})`.
3. `key` = `${providerId}:${sha256(apiKey).slice(0,8)}` (never log the raw key).

**Acceptance criteria**
- Unit tests: given headers with `remaining-requests: 0` and `reset: 1s`,
  `awaitLlmHeadroom` waits ≤ cap then resolves; given healthy headers it resolves
  synchronously (no timer).
- Respects `AbortSignal` (cancels the wait).
- No raw API key is ever logged or used as a map key in plaintext.

**Local verification**
```
pnpm --filter @hamafx/ai test
```

**Regression guardrails**
- The governor must be **fail-open**: any internal error → proceed with the call.
  Never block a chat turn indefinitely; hard cap the wait.

**Commit**: `perf(ai): pre-emptively smooth LLM calls using provider rate-limit headers`

---

#### RL-4 · P1 · rate-limits — Honor `Retry-After` in retry backoff

**Files**
- `packages/ai/src/retry.ts` (`withRetry`, `jitteredDelay`)
- `packages/ai/src/retry.test.ts`

**Evidence**
- `withRetry` computes delay purely from `jitteredDelay(base, attempt, max)` and
  never inspects a `Retry-After` header / `retryAfter` field on the error.
- Provider errors (AI SDK `APICallError`, and `ProviderError`) can carry an
  upstream-provided retry hint that is currently ignored, so retries can fire
  before the server-advertised cooldown → repeated 429s.

**Root cause**
Backoff ignores the authoritative server hint.

**Required change**
1. Add a `getRetryAfterMs(err): number | null` helper that reads, in order:
   `err.responseHeaders?.['retry-after']` (seconds or HTTP-date),
   `err.headers?.get('retry-after')`, `err.retryAfter`. Parse seconds and
   HTTP-date forms.
2. In `withRetry`, when the error is retryable and `getRetryAfterMs` returns a
   value, use `max(retryAfterMs, jitteredDelay(...))` capped at a new
   `maxRetryAfterMs` (default 30_000). Otherwise keep current jittered delay.
3. Fix the abort listener: currently `signal.addEventListener('abort', …)` is
   added per sleep without removal. Use `{ once: true }` and
   `removeEventListener` on resolve to avoid listener accumulation.

**Acceptance criteria**
- Test: error with `retry-after: 2` → next delay ≥ 2000ms.
- Test: HTTP-date `retry-after` parsed correctly.
- Test: no `Retry-After` → behavior identical to today (assert with mocked RNG).
- Test: abort during sleep rejects with `AbortError` and does not leak listeners.

**Local verification**
```
pnpm --filter @hamafx/ai test -- retry
```

**Commit**: `fix(ai): honor Retry-After header in withRetry backoff`

---

#### RL-5 · P1 · rate-limits — Apply per-user rate limits to expensive unprotected routes

**Files** (add `withRateLimit` guard)
- `apps/web/src/app/api/market/candles/route.ts`
- `apps/web/src/app/api/market/indicators/route.ts`
- `apps/web/src/app/api/market/price/route.ts`
- `apps/web/src/app/api/market/structure/route.ts`
- `apps/web/src/app/api/market/search/route.ts`
- `apps/web/src/app/api/news/route.ts`
- `apps/web/src/app/api/sentiment/route.ts`
- `apps/web/src/app/api/calendar/route.ts`
- `apps/web/src/app/api/journal/import/route.ts`
- `apps/web/src/app/api/decision-signals/route.ts`

**Evidence**
- Only ~10 of 92 API routes call `withRateLimit`. The routes above fan out to
  paid upstream providers or run heavy work but are ungated per user, enabling
  cost amplification / abuse via a logged-in client loop.
- Pattern already exists in `apps/web/src/app/api/chat/route.ts`:
  `const rl = await withRateLimit(user.userId, 'ai_chat', LIMIT); if (!rl.allowed) return 429 …`.

**Root cause**
Rate limiting was added ad hoc, not systematically.

**Required change**
Add `withRateLimit` to each route above using a **distinct `endpointGroup`** per
logical area and a per-minute limit from env with sane defaults:
- `market_read` (candles/indicators/price/structure/search) — default 120/min
  (`MARKET_READ_RATE_LIMIT`).
- `news_read` — 60/min (`NEWS_RATE_LIMIT`).
- `sentiment_read` — 30/min (`SENTIMENT_RATE_LIMIT`).
- `calendar_read` — 60/min (`CALENDAR_RATE_LIMIT`).
- `journal_import` — 5/min (`JOURNAL_IMPORT_RATE_LIMIT`).
- `decision_signals` — 60/min (`DECISION_SIGNALS_RATE_LIMIT`).
Return the same 429 envelope + `Retry-After: 60` + `X-RateLimit-*` headers as the
chat route. Place the check immediately after auth resolves, before any upstream
fetch or DB work.

**Acceptance criteria**
- Each route returns 429 with the standard envelope when the per-user minute
  count exceeds its limit; add one focused test per new `endpointGroup`.
- Defaults are generous enough not to break normal UI usage (verify against the
  client's polling intervals in `apps/web/src/hooks/**` — do not set a limit
  below the app's own refresh cadence).
- Document all new env vars in `.env.example`.

**Local verification**
```
pnpm --filter @hamafx/web test
```

**Regression guardrails**
- Do NOT add rate limits to `api/cron/**` (secret-gated, machine-driven),
  `api/health/**`, `api/billing/webhook` (Stripe HMAC), or SSE stream endpoints
  where a 429 would break long-lived connections.

**Commit**: `feat(web): add per-user rate limits to expensive market/news/journal routes`

---

### PHASE B — MEMORY & RUNTIME STABILITY

---

#### PERF-1 · P0 · performance — Bound MemoryCache (add LRU cap + expired-entry sweep)

**Files**
- `packages/data/src/cache/memory.ts`
- `packages/data/src/cache/memory.test.ts`

**Evidence**
- `MemoryCache` holds `private readonly store = new Map<string, Entry<unknown>>()`.
  Entries are only removed by `invalidateTag(tag)` and `clear()`. There is **no
  size cap and no expired-entry eviction** — `fetchWithMeta` overwrites a key on
  refresh but keys that are never re-requested (e.g. per-symbol+timeframe+count
  candle keys, per-article news keys) remain forever.
- In the **persistent worker process** this is an unbounded heap growth → OOM /
  GC pressure over days of uptime.

**Root cause**
Cache designed as an unbounded map; acceptable for short-lived functions,
unsafe for the long-lived worker.

**Required change**
Add bounded LRU semantics without changing the public `Cache` interface or the
single-flight / SWR behavior:
1. Add constructor option `{ maxEntries?: number }` (default 5000).
2. On `set`, if `store.size >= maxEntries`, evict the least-recently-used entry
   (track recency via insertion-order Map re-set on read, or a small LRU).
3. Add a lazy sweep: on each `fetchWithMeta`, opportunistically delete entries
   whose `hardExpiresAt < now` (bounded work per call, e.g. sweep ≤ 32 oldest
   candidates) OR run a periodic sweep guarded so it is a no-op in serverless
   (only start an interval when `HAMAFX_RUNTIME==='worker'`; use `unref()`).
4. Preserve: SWR fallback, in-flight single-flight, `invalidateTag`, `clear`.

**Acceptance criteria**
- Existing memory-cache tests pass unchanged.
- New test: inserting `maxEntries + 100` distinct keys keeps `store.size` ≤
  `maxEntries`; the most-recently-used keys survive.
- New test: an entry past `hardExpiresAt` is removed by the sweep and does not
  count toward size.
- No `setInterval` runs under `NODE_ENV==='test'` or on Vercel.

**Local verification**
```
pnpm --filter @hamafx/data test
```

**Regression guardrails**
- Do not change TTL/SWR timing semantics (see `ttl.ts`). Eviction is orthogonal
  to freshness. Interval timers MUST be `.unref()`ed so they never hold the
  process open.

**Commit**: `perf(data): bound MemoryCache with LRU cap and expired-entry sweep`

---

#### PERF-2 · P1 · performance — Evict idle per-tenant caches

**Files**
- `packages/data/src/cache/index.ts` (`_tenantCaches`, `getDefaultCache`,
  `getDefaultCacheSync`)
- `packages/data/src/cache/index.test.ts`

**Evidence**
- `const _tenantCaches = new Map<string, Cache>();` grows by **one `MemoryCache`
  per tenant** (`getDefaultCache(tenantId)`), and entries are only removed by
  `clearAllTenantCaches()` (tests only). In a multi-user worker this leaks one
  cache per distinct user seen, compounding PERF-1.

**Root cause**
Tenant cache registry has no lifecycle.

**Required change**
1. Track `lastAccess` per tenant cache. On access, update it.
2. Cap the registry (default 500 tenants). When over cap, evict the
   least-recently-accessed tenant's cache (call its `clear()` first).
3. Keep `__global__` sentinel exempt from eviction.

**Acceptance criteria**
- New test: exceeding the tenant cap evicts LRU tenants; `__global__` never
  evicted; a re-requested evicted tenant simply gets a fresh cache.
- Existing behavior for a single tenant unchanged.

**Local verification**
```
pnpm --filter @hamafx/data test
```

**Commit**: `perf(data): LRU-bound the per-tenant cache registry`

---

#### PERF-7 · P1 · performance — Prevent overlapping scheduler runs (reentrancy guard)

**Files**
- `apps/worker/src/scheduler.ts`
- `apps/worker/src/scheduler` tests (add if absent)

**Evidence**
- `setInterval(() => { void runJobSafely('multi-agent-analysis', log); }, 3_000)`
  fires every 3s **regardless of whether the previous poll finished**. The worker
  DB pool default is **3** (`packages/db/src/client.ts` `DEFAULT_WORKER_POOL_MAX`).
  If a poll's DB claim/run exceeds 3s (or several minute-cadence jobs overlap),
  concurrent `runJobSafely` invocations contend for the tiny pool and can
  saturate it, starving tick-flush writes.
- Minute-cadence `alerts`/`briefings` have DB-level idempotency but **no
  in-process concurrency guard**; a run exceeding its cadence overlaps itself.

**Root cause**
Timers fire on a fixed schedule with no "previous run still in flight" check.

**Required change**
1. Add a per-job in-flight guard (a `Set<string>` of running job names). In
   `runJobSafely`, if the job is already in the set, log at debug and return
   immediately; otherwise add, run, and remove in `finally`.
2. Convert the 3s `multi-agent-analysis` poll from `setInterval` to a
   **self-rescheduling `setTimeout`** loop: schedule the next tick only after the
   current one settles (`.finally(() => setTimeout(tick, 3000))`). `.unref()` the
   timer. This removes pile-up entirely.
3. Keep `JOB_TIMEOUT_MS` and `acquireCronLock` behavior unchanged.

**Acceptance criteria**
- Test: calling `runJobSafely(job)` twice concurrently runs the job body once.
- Test: the multi-agent loop schedules the next run only after the prior
  settles (assert with fake timers + a slow job stub).
- No change to which jobs run or their cadence under normal (fast) conditions.

**Local verification**
```
pnpm --filter @hamafx/worker test
```

**Regression guardrails**
- Do not remove the DB-level `FOR UPDATE SKIP LOCKED` claim or `acquireCronLock`;
  the in-process guard is additive defense, not a replacement.

**Commit**: `fix(worker): add reentrancy guard and self-rescheduling multi-agent poll`

---

### PHASE C — DB DURABILITY & RETENTION

---

#### DB-1 · P0 · database — Add retention/cleanup for unbounded high-write tables

**Files**
- (new) `apps/web/src/app/api/cron/cleanup-telemetry/route.ts`
- `apps/worker/src/jobs/` (new job `retention.ts`) + `jobs/index.ts` +
  `scheduler.ts` (new daily cron entry) + matching systemd unit under
  `infra/cron-vm/units/` (mirror an existing `*-cleanup*` timer/service pair)
- Reference existing pattern: `apps/web/src/app/api/cron/cleanup-tokens/route.ts`

**Evidence**
- Only `cleanup-tokens` (deletes expired `verification_tokens`) and
  `cleanup-uploads` (deletes >7d storage blobs) exist.
- These tables have **no retention** and grow unbounded:
  - `rate_limits` — PK `(user_id, endpoint_group, window_start[minute])`; one row
    per user per group **per minute**, forever. E.g. 30 users × 5 groups × 1440
    min/day ≈ 216k rows/day.
  - `chat_telemetry`, `tool_telemetry`, `diagnostic_traces` — one+ row per
    request/turn, forever.
  - `provider_daily_quota` (added in RL-2) — one row per provider per day.
- Unbounded growth → index/table bloat, autovacuum pressure, slower reads, rising
  storage cost.

**Root cause**
No data-retention policy for append-heavy operational tables.

**Required change**
Add a single **daily retention job** (worker) and an equivalent
**cron route** (web/Vercel) that deletes stale rows in batches:
- `rate_limits`: delete `window_start < now() - interval '2 hours'`.
- `chat_telemetry`, `tool_telemetry`: delete rows older than
  `TELEMETRY_RETENTION_DAYS` (default 90).
- `diagnostic_traces`: delete older than `TRACE_RETENTION_DAYS` (default 30).
- `provider_daily_quota`: delete `day < current_date - 3`.
Use bounded batched deletes (`DELETE … WHERE ctid IN (SELECT ctid … LIMIT 5000)`
loop, or `DELETE … WHERE <time> < cutoff` with a statement timeout guard) so a
single run cannot exceed the job timeout. Make retention windows env-configurable.

**Steps**
1. Implement the deletes in a shared function in `@hamafx/db`
   (e.g. `packages/db/src/retention.ts`, exported) so both the web cron route
   and the worker job call the same logic (dual-shape result handling per INV-1).
2. Web route: gate with the existing cron-secret check (`lib/cron.ts` bearer),
   `runtime = 'nodejs'`. Add to `vercel.json`/cron config if that is where the
   schedule lives (verify in repo; do not invent a scheduler).
3. Worker job: register in `jobs/index.ts`, add a daily `cron.schedule` entry
   (e.g. `15 3 * * *`) in `scheduler.ts` (subject to the RL/PERF-7 guard), plus a
   systemd `.service`/`.timer` mirroring existing units.

**Acceptance criteria**
- Running the job on a seeded DB deletes only rows older than the configured
  cutoffs and leaves recent rows intact (add a test in `@hamafx/db`).
- Deletes are batched and each run is bounded (no unbounded single statement).
- New env vars documented in `.env.example`.

**Local verification**
```
pnpm --filter @hamafx/db test && pnpm --filter @hamafx/worker test
```

**Regression guardrails**
- Never delete from user-content tables (chat_messages, journal, alerts,
  decision_signals, portfolio). Scope strictly to the operational tables listed.
- Idempotent and safe to run repeatedly.

**Commit**: `feat: add retention cleanup for rate_limits, telemetry, and traces`

---

#### DB-2 · P1 · security/database — Fail closed on DB TLS in production

**Files**
- `packages/db/src/client.ts` (`resolveSslOptions`)

**Evidence**
- `resolveSslOptions()` returns `{ rejectUnauthorized: false }` whenever
  `SUPABASE_CA_CERT` is absent — the connection is encrypted but the server
  certificate is **not verified**, allowing MITM on the DB link. The comment
  labels this a mid-rollout legacy fallback.

**Root cause**
Permanent insecure fallback intended to be temporary.

**Required change**
Make verification mandatory in production while preserving dev/self-host ergonomics:
1. If `SUPABASE_CA_CERT` present → `{ ca, rejectUnauthorized: true }` (unchanged).
2. Else if `process.env.NODE_ENV === 'production'` AND not explicitly opted out
   via `DB_ALLOW_INSECURE_TLS === 'true'` → **throw** a clear startup error
   instructing the operator to set `SUPABASE_CA_CERT` (or the opt-out).
3. Else (dev/test, or explicit opt-out) → keep `{ rejectUnauthorized: false }`.

**Acceptance criteria**
- Unit test: production + no CA + no opt-out → throws.
- Production + opt-out flag → returns insecure options (no throw).
- Dev/test → unchanged.

**Local verification**
```
pnpm --filter @hamafx/db test
```

**Regression guardrails**
- This can break a prod deploy that never set the CA cert. Ship behind the
  opt-out flag and call it out in the commit body and `.env.example` so operators
  set `SUPABASE_CA_CERT` before upgrading. Do NOT enable the throw without the
  documented escape hatch.

**Commit**: `fix(db): require verified TLS in production (opt-out flag preserved)`

---

### PHASE D — AI COST & THROUGHPUT

---

#### PERF-4 · P0 · performance/cost — Enable LLM prompt caching for the stable prefix

**Files**
- `packages/ai/src/agent.ts` (model call / message assembly)
- `packages/ai/src/multi-agent/agents/base-agent.ts` (specialist `generateText`)
- `packages/ai/src/prompt/**` (system prompt / shared-context builders)
- `packages/ai/src/model.ts` (provider option plumbing)

**Evidence**
- Grep for `cache_control` / `cacheControl` / `providerOptions` across
  `packages/ai/src` returns **nothing** — prompt caching is not used anywhere.
- Multi-agent runs 4 specialists in parallel (`orchestrator.ts` `Promise.all`),
  each rebuilding a large shared context + system prompt. With no caching, the
  large stable prefix is billed as fresh input tokens **per specialist, per
  turn**.

**Root cause**
Provider prompt-caching features are unused.

**Required change**
Enable provider prompt caching for the **stable prefix** (system prompt +
long-lived shared market context) where the active provider supports it:
- Anthropic (`@ai-sdk/anthropic`): mark the trailing stable system/content block
  with `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }`.
- OpenAI-compatible: automatic prefix caching applies when the stable prefix is
  first in the message array — ensure prompt assembly puts the stable prefix
  first and the volatile user turn last (verify current ordering; reorder only
  if it does not change semantics).
1. Add a small capability map in `model.ts` describing which resolved provider
   supports explicit cache markers.
2. In `base-agent.ts` and `agent.ts`, when supported, attach the cache marker to
   the largest stable block only. Never cache the volatile user message.

**Acceptance criteria**
- For an Anthropic-backed run, the request payload includes exactly one
  `cacheControl: ephemeral` marker on the stable block (assert via a mocked
  provider transport in a unit test).
- For unsupported providers, payload is unchanged (no marker) — assert.
- No change to model outputs/behavior; this only affects billing/latency.

**Local verification**
```
pnpm --filter @hamafx/ai test
```

**Regression guardrails**
- Do not cache anything user- or time-varying (breaks correctness / leaks stale
  context). Cache only content that is identical across calls within a turn.
- Keep it a no-op when the provider lacks support; never send unknown
  `providerOptions` to a provider that would reject them.

**Commit**: `perf(ai): enable provider prompt caching for the stable system/context prefix`

---

#### PERF-5 · P1 · performance — Bound specialist fan-out concurrency

**Files**
- `packages/ai/src/multi-agent/orchestrator.ts` (`Promise.all(specialists.map(...))`)

**Evidence**
- `const opinions = await Promise.all(specialists.map(async (agent) => { … await agent.run(agentCtx) … }))`
  launches all selected specialists simultaneously. On a low-tier BYOK key this
  bursts N concurrent LLM requests → 429s → degraded turns.

**Root cause**
Unbounded parallelism against a shared per-user rate budget.

**Required change**
1. Introduce a small concurrency limiter (implement a ~15-line `pLimit(n)` helper
   in `packages/ai/src/util` — do not add a dependency unless one is already
   present) with default `MULTI_AGENT_CONCURRENCY = 3` (env override).
2. Wrap each `agent.run` in the limiter. Preserve the existing per-agent
   try/catch so one failure does not reject the batch, and preserve result
   ordering and `validOpinions` filtering.

**Acceptance criteria**
- Test: with concurrency=2 and 4 specialists, at most 2 run at once (assert via a
  counter in a stubbed agent), all 4 still complete, ordering preserved.
- Failure isolation unchanged (a throwing specialist still yields a filtered-out
  opinion, not a batch rejection).

**Local verification**
```
pnpm --filter @hamafx/ai test
```

**Commit**: `perf(ai): cap multi-agent specialist fan-out concurrency`

---

#### PERF-6 · P1 · performance — Stop per-turn DELETE+INSERT into provider_tests

**Files**
- `packages/ai/src/agent.ts` (the `db.delete(schema.providerTests)` +
  `db.insert(schema.providerTests)` block around the rate-limit snapshot, ~L607)

**Evidence**
- On every chat turn that returns rate-limit headers, the code does a
  `DELETE` followed by an `INSERT` into `provider_tests` purely to store the
  latest snapshot — **two writes per turn on the response path**, and it is
  `await`ed (blocks turn completion).

**Root cause**
Diagnostic snapshot written with delete-then-insert on the hot path.

**Required change**
1. Replace DELETE+INSERT with a single idempotent upsert
   (`INSERT … ON CONFLICT (user_id, provider_id) DO UPDATE SET …`). Confirm/add
   the unique constraint on `(user_id, provider_id)` via a **new** migration if
   absent (do not edit old migrations).
2. Move the write off the response path using the existing
   `waitUntil` helper (`packages/ai/src/wait-until.ts`) so it does not delay the
   stream close. Keep the `try/catch`→`console.warn` fail-soft behavior.

**Acceptance criteria**
- One write per turn (upsert), not two; verified by test spy.
- Turn latency no longer includes the provider_tests write (it runs via
  `waitUntil`).
- Snapshot still updated (last-writer-wins) — assert row reflects latest data.

**Local verification**
```
pnpm --filter @hamafx/ai test
```

**Regression guardrails**
- If the unique constraint must be added, ensure the migration is idempotent and
  passes the full-migration-chain test.

**Commit**: `perf(ai): upsert provider_tests off the response path instead of delete+insert`

---

### PHASE E — SECURITY HARDENING

---

#### SEC-1 · P0 · security — Close the `x-user-id` header trust footgun

**Files**
- `apps/web/src/lib/api.ts` (`getUserFromRequest` fast path)
- `apps/web/src/middleware.ts` (header injection)
- (new) `apps/web/src/lib/signed-user-header.ts`
- (new) `apps/web/test/**` matcher-coverage test

**Evidence**
- `getUserFromRequest` fast path: `const headerId = req.headers.get('x-user-id'); if (headerId) return { userId: headerId };` — it trusts the header **without any in-handler verification**.
- Safety depends entirely on `middleware.ts` (a) overwriting/deleting inbound
  `x-user-id` and (b) the `config.matcher` regex covering **every** route that
  calls `withAuth`. Any `withAuth` route added under an excluded matcher prefix
  (`api/dev`, `api/cron`, `api/telegram`, `api/billing/webhook`, `debug`, …) would
  trust a client-supplied `x-user-id` → **impersonation of any user**.

**Root cause**
Cross-layer trust of an unauthenticated transport header; correctness hinges on
a regex staying in sync with route auth.

**Required change** (defense-in-depth, keep the fast path)
1. In `middleware.ts`, instead of injecting a bare `x-user-id`, inject a
   **signed** header: `x-user-id` plus `x-user-id-sig` =
   HMAC-SHA256(`${userId}.${requestId}`, `AUTH_HEADER_SECRET`) (reuse an existing
   server secret such as `NEXTAUTH_SECRET`/`ENCRYPTION_SECRET`; do not add a new
   required secret if one already fits).
2. In `getUserFromRequest`, the fast path must **verify the signature** (cheap,
   no DB) before trusting `x-user-id`. If signature missing/invalid → fall
   through to the `auth()` slow path (which reads the JWT). This makes a spoofed
   header useless everywhere, regardless of matcher coverage.
3. Add a test that enumerates all `export const (GET|POST|PUT|PATCH|DELETE)` route
   files importing `withAuth` and asserts each path is **matched** by the
   middleware `config.matcher` (fails CI if a future route escapes coverage).

**Acceptance criteria**
- A request with a forged `x-user-id` and no valid signature is treated as
  unauthenticated (401) — add a test.
- A legitimate middleware-signed request still resolves the user via the fast
  path with no DB call — add a test.
- The matcher-coverage test passes for the current route set.
- Secrets never logged.

**Local verification**
```
pnpm --filter @hamafx/web test
```

**Regression guardrails**
- Keep the `auth()` slow path intact as fallback so admin/edge cases still work.
- HMAC compare must be constant-time (`crypto.timingSafeEqual`).

**Commit**: `fix(web): sign and verify the x-user-id middleware header to prevent impersonation`

---

#### SEC-2 · P1 · security — Tighten Content-Security-Policy (drop script `unsafe-inline`)

**Files**
- `apps/web/next.config.mjs` (`headers()` CSP)
- `apps/web/src/middleware.ts` (nonce injection, if adopted)

**Evidence**
- CSP `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com`
  — `'unsafe-inline'` on scripts negates most XSS protection.

**Root cause**
Permissive CSP to accommodate inline scripts.

**Required change**
1. Adopt a **nonce-based** CSP for `script-src`: generate a per-request nonce in
   middleware, expose it (e.g. via a header/root layout), and drop
   `'unsafe-inline'` for scripts. Keep `'unsafe-eval'` only if a runtime
   dependency provably requires it (verify by testing with it removed first).
2. If nonce adoption is too invasive for inline framework bootstrap, at minimum
   replace `'unsafe-inline'` with specific `'sha256-…'` hashes for the known
   inline scripts (Tailwind/dark-mode/TradingView bootstrap).

**Acceptance criteria**
- App loads and functions (chat, charts, TradingView widget) with the tightened
  policy — verify via Playwright smoke run.
- No `'unsafe-inline'` in `script-src`. Document any retained `'unsafe-eval'`
  with the specific library that needs it.

**Local verification**
```
pnpm --filter @hamafx/web exec playwright test  # smoke subset
```

**Regression guardrails**
- Do not break the TradingView embed or the service worker registration. If a
  full nonce rollout risks breakage, ship the hash-based interim and open a
  follow-up note in the log.

**Commit**: `fix(web): tighten CSP script-src (remove unsafe-inline)`

---

#### SEC-3 · P1 · security/robustness — Run worker container as non-root + add HEALTHCHECK

**Files**
- `Dockerfile.worker`

**Evidence**
- The `runner` stage has no `USER` directive → the process runs as **root**.
- No `HEALTHCHECK` directive, despite `apps/worker/src/healthchecks.ts` exposing
  an HTTP endpoint (ports 8080/8081 are `EXPOSE`d).

**Root cause**
Container defaults not hardened.

**Required change**
1. In the `runner` stage, after copying files, `chown` the app dir to the
   built-in `node` user and add `USER node`.
2. Add `HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3
   CMD curl -fsS http://localhost:8081/health || exit 1` (confirm the exact
   health path/port from `healthchecks.ts`; do not guess — read it).

**Acceptance criteria**
- `docker build -f Dockerfile.worker .` succeeds.
- Container starts as `node`, not root (`whoami` in an exec is `node`).
- `docker inspect` shows the healthcheck; it reports healthy against the real
  endpoint.

**Local verification**
```
docker build -f Dockerfile.worker -t hamafx-worker-test .
```

**Regression guardrails**
- Ensure the `node` user can read the deployed files and bind the exposed ports
  (>1024, so non-root binding is fine). Do not change `NODE_OPTIONS` here (that
  is SEC-4's job).

**Commit**: `fix(docker): run worker as non-root and add container HEALTHCHECK`

---

#### SEC-4 · P2 · security/robustness — Remove global `--openssl-legacy-provider` by fixing PEM handling

**Files**
- `Dockerfile.worker` (`ENV NODE_OPTIONS=--openssl-legacy-provider`)
- `packages/ai/src/multi-agent/**` and/or wherever Google Vertex service-account
  PEM keys are normalized (grep `PEM`, `PRIVATE KEY`, `openssl`, `createSign`,
  `GoogleAuth`, `credentials`).

**Evidence**
- `Dockerfile.worker` sets `NODE_OPTIONS=--openssl-legacy-provider`, globally
  re-enabling legacy OpenSSL algorithms to work around flattened-PEM parsing.
- Git history shows a fragile PEM saga: `normalize PEM private keys for OpenSSL
  3.x compat`, `remove $ anchor from PEM footer regex for flat keys`, `fix PEM
  regex that could never match flat keys` — i.e., the real bug is incorrect PEM
  normalization, not OpenSSL.

**Root cause**
A parsing bug masked by weakening the whole runtime's crypto policy.

**Required change**
1. Implement robust PEM normalization: accept keys with escaped `\n`, literal
   newlines, or single-line "flat" bodies, and **re-wrap** the base64 body to
   canonical 64-char lines with correct `-----BEGIN/END …-----` headers. Add
   focused unit tests for each malformed input shape → valid PEM output.
2. Verify signing works on Node 20 with modern OpenSSL (no legacy provider).
3. Remove `ENV NODE_OPTIONS=--openssl-legacy-provider` from `Dockerfile.worker`.

**Acceptance criteria**
- Unit tests cover: escaped-`\n` key, flat single-line key, already-correct key,
  and CRLF key → all normalize to a valid PEM that `crypto.createPrivateKey`
  accepts without the legacy provider.
- Worker image builds and the Vertex auth path signs a JWT successfully without
  `--openssl-legacy-provider`.

**Local verification**
```
pnpm --filter @hamafx/ai test && docker build -f Dockerfile.worker .
```

**Regression guardrails**
- This is the highest-risk change to auth against Google. Keep it LAST in the
  security phase. If modern-OpenSSL signing cannot be made to work with a real
  key in the time available, mark `BLOCKED` and leave the flag — do not ship a
  broken auth path.

**Commit**: `fix: robust PEM normalization; drop global openssl-legacy-provider`

---

### PHASE F — CLEANUPS & CORRECTNESS

---

#### CLEAN-1 · P2 · cleanup — Remove or wire the dead `NextjsCache`

**Files**
- `packages/data/src/cache/nextjs.ts`
- `packages/data/src/cache/index.ts` (comment referencing NextjsCache)

**Evidence**
- Grep shows `cache/nextjs.ts` is **imported nowhere** (`getDefaultCache` always
  constructs `new MemoryCache()`), yet the doc comment in `index.ts` claims
  "Inside Next.js … uses a per-tenant `NextjsCache` (which wraps a `MemoryCache`)".
  Code contradicts the comment — dead file + misleading doc.

**Root cause**
Abandoned implementation left in the tree; comment never corrected.

**Required change**
Pick ONE, based on intent (default to removal since it is unused):
- **Remove** `nextjs.ts`, delete its tests if any, and fix the `index.ts` comment
  to describe the actual MemoryCache-only behavior. Update `knip.json` if it was
  suppressing the unused file.

**Acceptance criteria**
- `pnpm knip` (or the repo's dead-code check) reports no new unused exports.
- No import breakage; build green.
- The `index.ts` comment now matches the code.

**Local verification**
```
pnpm --filter @hamafx/data test && pnpm typecheck
```

**Commit**: `chore(data): remove unused NextjsCache and correct cache docs`

---

#### CLEAN-2 · P2 · reliability — Limit circuit breaker to a single HALF_OPEN probe

**Files**
- `packages/data/src/circuit-breaker.ts`
- `packages/data/src/circuit-breaker.test.ts`

**Evidence**
- On `OPEN → HALF_OPEN` transition, `call()` sets `internal.state = 'HALF_OPEN'`
  and lets the request through, but there is **no guard limiting concurrency**:
  every concurrent caller during HALF_OPEN executes `fn()`. The comment says
  "allow one probe" but the code allows many, defeating the probe's purpose and
  hammering a recovering upstream.

**Root cause**
Missing single-flight guard on the probe.

**Required change**
1. Add `probeInFlight: boolean` to `BreakerInternal`.
2. When transitioning to (or already in) HALF_OPEN: if `probeInFlight` is true,
   **fail fast** (throw the same OPEN-style error) instead of calling `fn()`.
   Set `probeInFlight = true` before the probe, clear it in `finally`.
3. Keep existing success/failure thresholds and transitions.

**Acceptance criteria**
- Test: while a HALF_OPEN probe is in flight, other concurrent calls fail fast
  (fn invoked exactly once).
- Existing state-machine tests pass unchanged.

**Local verification**
```
pnpm --filter @hamafx/data test -- circuit
```

**Commit**: `fix(data): allow only one in-flight HALF_OPEN probe in circuit breaker`

---

#### CLEAN-3 · P2 · reliability — Fix AbortSignal listener accumulation in provider fetches

**Files**
- `packages/data/src/providers/twelvedata/rest.ts` and the sibling REST clients
  that share the pattern: `binance/rest.ts`, `biquote/rest.ts`, `finnhub/rest.ts`,
  `fred/rest.ts`, `marketaux/rest.ts`, `cftc/rest.ts`.

**Evidence**
- Pattern: `opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal!.reason))`
  with **no `removeEventListener`** and no `{ once: true }`. Under a long-lived
  parent signal (worker), listeners accumulate on that signal across many calls.

**Root cause**
Event listener registered per call, never released.

**Required change**
Prefer `AbortSignal.any([opts.signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])`
(Node 20.11+ supports it) to compose the caller signal with the per-call timeout,
eliminating manual listener management and the separate `setTimeout`. If keeping
the manual approach, add `{ once: true }` and `removeEventListener` in a `finally`.
Apply the same fix consistently across all listed REST clients.

**Acceptance criteria**
- No `addEventListener('abort', …)` without cleanup remains in the data
  providers.
- Timeout and caller-abort behavior unchanged (existing provider tests pass;
  add a test that aborting the parent signal rejects the fetch and does not grow
  the signal's listener count).

**Local verification**
```
pnpm --filter @hamafx/data test
```

**Commit**: `fix(data): compose abort+timeout signals to avoid listener leaks`

---

#### PERF-8 · P2 · performance — Replace per-row loops with bulk writes

**Files**
- `packages/ai/src/persistence.ts` (thread-fork message copy loop:
  `for (let i…) { const [row] = await tx.insert(chatMessages)… }`)
- `apps/web/src/app/api/settings/symbols/route.ts` (reorder:
  `for (let i…) { await tx.update(userSymbols)… }`)

**Evidence**
- Thread fork inserts copied messages one INSERT per message; watchlist reorder
  issues one UPDATE per symbol. Both are N sequential round-trips inside a
  transaction — latency scales with N.

**Root cause**
Row-at-a-time writes where a set-based statement suffices.

**Required change**
1. Fork: build the full array of message rows and do a **single**
   `tx.insert(chatMessages).values(rows)` (preserve ordering/`createdAt` and any
   id remapping). If remapped ids are needed downstream, capture them from a
   single `returning()`.
2. Reorder: issue one bulk update, e.g. `UPDATE user_symbols SET sort_order =
   v.ord FROM (VALUES …) AS v(symbol, ord) WHERE …`, or drizzle's batch update
   equivalent, in one statement.

**Acceptance criteria**
- Fork of an N-message thread performs a single insert statement (assert query
  count via spy) and produces identical rows/order as before.
- Reorder performs a single statement and yields identical final ordering.
- Existing tests pass; add count-assertion tests.

**Local verification**
```
pnpm --filter @hamafx/ai test && pnpm --filter @hamafx/web test
```

**Regression guardrails**
- Keep everything inside the existing transaction. Do not change external
  behavior (same resulting rows). Watch `noUncheckedIndexedAccess` when indexing
  arrays.

**Commit**: `perf: bulk-insert forked messages and bulk-update watchlist order`

---

### PHASE G — DEPENDENCY HYGIENE

---

#### UPG-1 · P2 · upgrade — Triage open dependency updates; plan next-auth GA

**Files**
- Root + workspace `package.json` files, `pnpm-lock.yaml`
- Open Dependabot branches (observed): `drizzle-kit-0.31.10`, `turbo-2.10.4`,
  `msw-2.15.0`, `typescript-eslint-8.63.0`, `ai-sdk/openai-compatible-3.0.7`,
  `actions/upload-artifact-7`.

**Evidence**
- Multiple Dependabot PRs are open. `next-auth` is pinned to a **beta**
  (`5.0.0-beta.31`) in production — betas can ship breaking changes between
  patch bumps.

**Root cause**
Deferred dependency maintenance + reliance on a pre-GA auth library.

**Required change**
1. For each open Dependabot update, on a branch: install, run the **full global
   verification suite** (Section 4.2) plus web e2e smoke. Merge only those that
   are green. Do NOT bulk-merge; one dependency per commit.
   - `actions/upload-artifact` (CI-only) and `turbo` are low risk — do first.
   - `typescript-eslint`, `msw` (dev/test) next.
   - `drizzle-kit` and `@ai-sdk/openai-compatible` are runtime-adjacent — verify
     migrations generate identically and provider calls still pass.
2. Do NOT attempt an ad-hoc `next-auth` GA migration inside this plan. Instead,
   write a short spike note in `/RELIABILITY_HARDENING_LOG.md` listing the beta
   version in use and the breaking-change surface, so it can be scheduled
   separately. Pin the exact beta (remove any `^`/range that could float to a
   newer, differently-broken beta).

**Acceptance criteria**
- Each merged upgrade passes typecheck + lint + test (+ e2e smoke for runtime
  deps).
- `next-auth` is pinned to an exact version (no caret) and a spike note exists.
- `pnpm-lock.yaml` is committed and `--frozen-lockfile` install succeeds.

**Local verification**
```
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test
```

**Regression guardrails**
- Reject any upgrade that forces a `tsconfig` relaxation, a lint suppression, or
  changes auth/session behavior. Auth-affecting upgrades are out of scope here.

**Commit** (per dep): `chore(deps): bump <pkg> to <version>`

---

## 6. EXECUTION ORDER & DEPENDENCY GRAPH

Implement strictly in this order. Rationale: land shared primitives first, then
consumers; land lowest-risk-highest-value P0s before invasive security work;
keep the tree green after every step.

```
Phase A (rate limits/quota)
  1. RL-1  (throttle backend default)          [enables RL-2]
  2. RL-2  (shared daily quota)                [depends: RL-1; needs migration]
  3. RL-4  (Retry-After)                        [standalone]
  4. RL-3  (LLM header governor)                [standalone; nice before D]
  5. RL-5  (route rate limits)                  [standalone]

Phase B (memory/runtime)
  6. PERF-1 (bound MemoryCache)                 [standalone; worker-critical]
  7. PERF-2 (tenant cache LRU)                  [depends: PERF-1 mental model]
  8. PERF-7 (scheduler reentrancy)              [standalone]

Phase C (DB durability/retention)
  9. DB-1  (retention crons)                    [depends: RL-2 table exists]
 10. DB-2  (TLS fail-closed, flagged)           [standalone]

Phase D (AI cost/throughput)
 11. PERF-6 (provider_tests upsert off-path)    [may add migration]
 12. PERF-5 (fan-out concurrency cap)           [standalone]
 13. PERF-4 (prompt caching)                    [after PERF-5; biggest cost win]

Phase E (security)
 14. SEC-1  (signed x-user-id header)           [P0; do early if time-boxed]
 15. SEC-2  (CSP tighten)
 16. SEC-3  (docker non-root + healthcheck)
 17. SEC-4  (PEM fix + drop legacy provider)    [LAST; highest auth risk]

Phase F (cleanups/correctness)
 18. CLEAN-1 (dead NextjsCache)
 19. CLEAN-2 (single HALF_OPEN probe)
 20. CLEAN-3 (abort listener leak)
 21. PERF-8  (bulk writes)

Phase G (deps)
 22. UPG-1   (triage upgrades; pin next-auth)
```

**Time-boxing note for the agent:** If you cannot complete all 22, complete in
priority order: all **P0** (RL-1, RL-2, PERF-1, DB-1, PERF-4, SEC-1), then all
**P1**, then **P2**. A partial run that lands every P0 green is a success; a run
that lands P2 polish while leaving a P0 unaddressed is not.

---

## 7. DEFINITION OF DONE (whole plan)

- Every attempted work order is `DONE` or `ALREADY-RESOLVED` (or explicitly
  `BLOCKED` with a reason) in `/RELIABILITY_HARDENING_LOG.md`.
- `pnpm typecheck && pnpm lint && pnpm test` is green on the final tree.
- `pnpm --filter @hamafx/db test` (full migration chain) green; migrations are
  all **new**, sequential, and never edited in place.
- No new `as any`, `@ts-ignore`, or `eslint-disable` were introduced.
- No Section 3 invariant regressed.
- New behavior that could affect existing deployments (RL-1 default flip, DB-2
  TLS, RL-5 limits) is env-gated or documented in `.env.example`, and the commit
  bodies state the operator action required (if any).
- Every touched comment/doc that previously contradicted the code has been
  corrected to match the new code.

---

## 8. EVIDENCE INDEX (verified file references — re-confirm before editing)

| Finding | Primary file(s) | Observed code anchor |
|---|---|---|
| RL-1 | `packages/data/src/cache/throttle.ts`; `.env.example` | `process.env.THROTTLE_BACKEND !== 'postgres'`; `THROTTLE_BACKEND=` (empty) |
| RL-2 | `packages/data/src/providers/twelvedata/rest.ts` | `let dailyCount = 0; let dailyResetAt = …`; `checkDailyQuota()` |
| RL-3 | `packages/ai/src/rate-limits.ts`; `agent.ts`; `model.ts` | `extractRateLimits(...)` result only written to `provider_tests` |
| RL-4 | `packages/ai/src/retry.ts` | `jitteredDelay(...)`; no `retry-after` read; per-sleep `addEventListener` |
| RL-5 | `apps/web/src/app/api/**/route.ts` | only ~10/92 routes call `withRateLimit` |
| PERF-1 | `packages/data/src/cache/memory.ts` | `store = new Map(...)`; no size cap / no expiry sweep |
| PERF-2 | `packages/data/src/cache/index.ts` | `_tenantCaches = new Map(...)`; only cleared by tests |
| PERF-7 | `apps/worker/src/scheduler.ts` | `setInterval(..., 3_000)`; no in-flight guard; worker pool=3 |
| DB-1 | `schema/rate-limits.ts`, `telemetry.ts`, `tool-telemetry.ts`, `diagnostic-traces.ts` | no retention cron (only tokens/uploads exist) |
| DB-2 | `packages/db/src/client.ts` | `resolveSslOptions()` → `{ rejectUnauthorized: false }` fallback |
| PERF-4 | `packages/ai/src/**` | no `cache_control`/`providerOptions` anywhere |
| PERF-5 | `packages/ai/src/multi-agent/orchestrator.ts` | `await Promise.all(specialists.map(...))` |
| PERF-6 | `packages/ai/src/agent.ts` | `db.delete(providerTests)` then `db.insert(providerTests)` per turn |
| SEC-1 | `apps/web/src/lib/api.ts`; `middleware.ts` | fast path returns `x-user-id` header without verification |
| SEC-2 | `apps/web/next.config.mjs` | `script-src 'self' 'unsafe-eval' 'unsafe-inline' …` |
| SEC-3 | `Dockerfile.worker` | no `USER`, no `HEALTHCHECK` |
| SEC-4 | `Dockerfile.worker` | `ENV NODE_OPTIONS=--openssl-legacy-provider` (masks PEM bug) |
| CLEAN-1 | `packages/data/src/cache/nextjs.ts` | imported nowhere; `index.ts` comment claims it is used |
| CLEAN-2 | `packages/data/src/circuit-breaker.ts` | HALF_OPEN allows unbounded concurrent probes |
| CLEAN-3 | `packages/data/src/providers/*/rest.ts` | `addEventListener('abort', …)` without cleanup |
| PERF-8 | `packages/ai/src/persistence.ts`; `settings/symbols/route.ts` | per-row `await` insert/update in loops |
| UPG-1 | `package.json` files; open dependabot branches | `next-auth: 5.0.0-beta.31`; multiple open bumps |

**Verified healthy (do NOT create tasks for these):** atomic budget reservation
(`cost.ts`), atomic rate limiter (`rate-limit.ts`), HNSW vector indexes
(news/memory embeddings), strict `tsconfig`, chat hot-path composite indexes,
Next `15.5.18` (CVE-2025-29927 not applicable), migration journal 51/51 in sync.

*End of plan.*
