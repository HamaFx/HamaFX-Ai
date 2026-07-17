# HamaFX-AI — k6 Load & Performance Testing — Implementation Prompt Plan

> **AUDIENCE: An autonomous AI coding agent.** This file is a machine-actionable
> work-order spec, not human documentation. It adds a brand-new **k6 real-load
> testing** capability to the repo. Every task is self-contained and
> deterministic. Do not summarize; execute. Do not improvise scope; implement
> exactly what each work order specifies and nothing more.
>
> This plan was authored after a full read of the repository's existing testing
> system (Vitest unit/integration + Playwright E2E + a custom AI eval harness)
> and after reading the current Grafana k6 documentation (k6 ≥ v0.57, native
> TypeScript support, scenarios/executors, thresholds, test types, and the
> `grafana/setup-k6-action` + `grafana/run-k6-action` CI actions).

---

## 0. HOW TO CONSUME THIS PLAN (agent operating instructions)

0.1 Read Sections 1–5 fully before writing any k6 code. They define the repo
    facts, the system-under-test (SUT) map, the auth/CSRF/rate-limit reality
    that k6 must satisfy, and the k6 concepts you will use.

0.2 Execute work orders in the order given by Section 7 (dependency graph).
    Do **one work order at a time**. Never batch unrelated work orders into a
    single commit.

0.3 For **every** work order, run this loop:
    1. Re-read the exact files named in the work order and confirm the
       "Evidence" still matches the current code (line numbers may have
       drifted — match on the quoted code, not the line number).
    2. If a target file already exists with the described content (someone
       already did it), mark the work order `ALREADY-RESOLVED` and skip.
    3. Implement the "Required change" precisely.
    4. Run the work order's "Local verification" commands.
    5. Run the global verification suite (Section 5.3).
    6. Only if all pass, produce the commit using the "Commit" line verbatim.
    7. Append a status line to `/K6_LOAD_TESTING_LOG.md` (create if missing):
       `<WORK-ORDER-ID> | <DONE|ALREADY-RESOLVED|BLOCKED> | <commit sha> | <notes>`.

0.4 **CRITICAL RULE — trust the code, not the docs.** This repository's Markdown
    docs are known to drift from reality (see `docs/09-testing.md` counts vs.
    actual file counts). Before relying on any documented behavior of the app,
    verify it in source. When a comment and the code disagree, the code is
    ground truth.

0.5 **Do no harm.** This is an *additive* capability. It must not change any app
    runtime behavior, must not modify existing Vitest/Playwright tests, must not
    alter `turbo.json` task graph semantics for existing tasks, and must not add
    k6 as a blocking gate on the existing PR CI (`ci-fast.yml`). k6 load tests
    are heavy and non-deterministic; they run in a dedicated workflow (see
    Phase K9). If a required change conflicts with an invariant in Section 4,
    stop and mark the work order `BLOCKED`.

0.6 **k6 is not Node.** k6 runs scripts on its own Go-embedded JS runtime (Sobek),
    NOT Node.js. You cannot `import` npm packages that rely on Node built-ins,
    you cannot use `fetch`/`axios`, and `require()` only resolves k6 built-in
    modules, local files, and remote HTTPS. Use only `k6/*` modules and jslib
    (`https://jslib.k6.io/...`) imports. Do not try to reuse the app's TypeScript
    source, `@hamafx/*` workspace packages, Vitest helpers, or Playwright
    fixtures inside k6 scripts. The k6 suite is a **separate, standalone**
    TypeScript project that talks to the running app **only over HTTP/WS**.

0.7 If a work order cannot be completed within its acceptance criteria without
    expanding scope, mark it `BLOCKED` and move on. Never leave the repo in a
    state where `pnpm turbo run build`, `pnpm turbo run test -- --run`, lint, or
    typecheck fail.

---

## 1. REPOSITORY FACTS (verified against source)

- **Monorepo**: pnpm workspaces (`pnpm@9.15.4`) + Turborepo (`turbo@^2.10.5`).
  Node `>=20.11` (`.nvmrc` = `20`).
- **Apps**:
  - `apps/web` — Next.js 15 (App Router, `next@^15.1.4`, React 19). Serves all
    HTTP APIs under `apps/web/src/app/api/**` (93 `route.ts` files). This is the
    **primary load-test target**.
  - `apps/worker` — persistent Node process (`@microsoft/signalr`, `ws`,
    `node-cron`). Consumes an upstream SignalR tick hub, aggregates candles,
    runs jobs. Not an HTTP server for users; see Section 3.6 for how (and
    whether) to load-test it.
- **Packages**: `@hamafx/ai`, `@hamafx/data`, `@hamafx/db` (Drizzle +
  postgres-js in prod, PGlite in dev/tests), `@hamafx/shared`,
  `@hamafx/indicators`, `@hamafx/config`, `@hamafx/test-utils`.
- **DB**: Postgres with the **pgvector** extension. Prod/docker image is
  `pgvector/pgvector:pg16` (see `docker-compose.yml`). Dev default is in-process
  **PGlite**. The `/api/health` endpoint FAILS (503) if pgvector is missing, so
  load-testing against PGlite is unreliable — use a real Postgres+pgvector
  (Section 6).

### 1.1 Existing testing system (this is what k6 augments, not replaces)

| Layer | Tool | Location | Purpose |
|---|---|---|---|
| Unit / integration | **Vitest** `^2.1.8` | `packages/*/test/**`, `apps/*/test/**`, `apps/web/tests/**` | ~173 test files / 590+ cases. Pure logic, mocked providers, isolated DB tx, mocked NextAuth sessions, route-handler integration via `next-test-api-route-handler`. |
| E2E (browser) | **Playwright** `^1.61.0` | `apps/web/tests/e2e/**` (16 specs) | Real browser flows: auth, chat streaming, settings, isolation, a11y, responsive. Boots the app via `webServer` in `playwright.config.ts`. |
| AI quality | Custom **eval harness** | `packages/ai/src/eval/` (`cases.json`) | Manual/nightly CLI; POSTs to `/api/chat`, captures SSE, writes markdown report. Not perf. |
| Perf (frontend only) | **Lighthouse** `^13.3.0` | `tools/lighthouse/run.mjs` | Page-level web-vitals audit. NOT backend load. |

**Gap this plan fills:** there is currently **no real load / throughput /
concurrency testing** of the HTTP API. Vitest exercises correctness with a
single simulated request; Playwright exercises UX with a couple of browsers;
Lighthouse measures front-end vitals. None of them answer "how many concurrent
users can the `/api/chat`, `/api/market/*`, and `/api/health` endpoints sustain,
at what latency percentiles, before errors climb?" — that is k6's job.

Verified: `grep -ril "k6\|artillery\|autocannon\|gatling\|locust"` across the
repo returns **no** existing load-testing tooling (the only `.github` hits are
the literal string "Upload" in `actions/upload-artifact`). This is greenfield.

### 1.2 Commands (run from repo root unless noted)

```bash
pnpm install --frozen-lockfile      # install workspace deps
pnpm turbo run build                # build all packages/apps
pnpm turbo run lint                 # eslint across workspace
pnpm turbo run typecheck            # tsc --noEmit across workspace
pnpm turbo run test -- --run        # all Vitest suites, no watch
pnpm --filter @hamafx/web exec playwright test   # E2E
pnpm --filter @hamafx/web dev       # run web app on :3000 (dev, PGlite)
pnpm --filter @hamafx/web build && pnpm --filter @hamafx/web start   # prod-mode web
```

### 1.3 CI facts (verified)

- `.github/workflows/ci-fast.yml` — runs on **every pull_request**: lint,
  typecheck, build, Vitest (+coverage), Playwright E2E sharded 1/2 & 2/2.
  **Must stay fast; do NOT add k6 here.**
- `.github/workflows/ci-slow.yml` — runs on push to `main` + nightly cron
  (`0 0 * * *`): lint/typecheck, Vitest, Playwright sharded 1..4, and (on the
  schedule only) `nightly-eval` → `pnpm turbo run eval`. **This is the model to
  copy for the nightly k6 job**, but k6 gets its own workflow file (Phase K9).
- Uses `pnpm/action-setup@v4` (auto-detects pinned pnpm) + `actions/setup-node@v4`
  (`node-version: 20`, `cache: pnpm`).

---

## 2. k6 PRIMER (grounded in current Grafana k6 docs — use these facts)

k6 is a Grafana OSS load-testing tool. Scripts are JS/TS run on k6's own runtime
(not Node). A script exports a `default` function (the VU code, run repeatedly)
and an `options` object (load model + pass/fail criteria). Optional `setup()`
(runs once before the test, return value is passed to each VU) and `teardown()`
(runs once after).

### 2.1 Native TypeScript (k6 ≥ v0.57)
- k6 v0.57+ runs `.ts` files **directly** — `k6 run script.ts`. It uses esbuild
  to **strip types** (no type *checking*, no bundling of npm packages).
- The old `--compatibility-mode=experimental_enhanced` flag is **removed**; do
  not use it. Default compatibility mode is `extended`.
- Pin the k6 version in CI to **v0.57.0 or newer** so native TS works.
- Because k6 only strips types, we still run a separate `tsc --noEmit` for type
  safety in dev/CI (Phase K1), using `@types/k6`.

### 2.2 Load model — `scenarios` + `executors`
Prefer **scenarios** (multiple named workloads, arrival-rate control) over the
simple `vus`/`duration` shorthand. Executors (verified list):

| Executor | Meaning | Use for |
|---|---|---|
| `shared-iterations` | fixed total iterations shared across VUs | quick smoke |
| `per-vu-iterations` | each VU runs N iterations | deterministic smoke |
| `constant-vus` | fixed VUs for a duration | simple steady load |
| `ramping-vus` | VUs ramp via `stages` | stress/spike by concurrency |
| `constant-arrival-rate` | fixed **iters/sec** (open model) | throughput/RPS SLOs |
| `ramping-arrival-rate` | ramping **iters/sec** | average-load & stress by RPS |

**Rule for this project:** model server-side SLOs with **arrival-rate**
executors (`constant-arrival-rate` / `ramping-arrival-rate`) because we care
about requests/sec the API sustains, not just VU count. Arrival-rate needs
`preAllocatedVUs` and `maxVUs`. Use `ramping-vus` only for spike-by-concurrency.

### 2.3 Test types (build one file per type, reuse the scenario logic)
Per k6 docs, cover these types (Phase K3–K8):
- **Smoke** — 1–a few iterations / very low VUs. Validates the script + SUT wiring. Run first, always.
- **Average-load** — normal expected traffic; the baseline for regression comparison.
- **Stress** — maximum expected traffic; find the breaking point.
- **Spike** — sudden surge then drop.
- **Soak** — moderate load for a long duration (e.g. 1–4h) to find leaks/degradation.

### 2.4 Thresholds (pass/fail gates) & checks (assertions)
- **`checks`** (`import { check } from 'k6'`) assert per-response conditions but
  do **NOT** fail the test by themselves.
- **`thresholds`** in `options.thresholds` are the pass/fail gates; a breached
  threshold makes `k6 run` exit non-zero → this is how CI gates on perf.
- Standard thresholds to use (tune per endpoint in Phase K4):
  ```ts
  thresholds: {
    http_req_failed: ['rate<0.01'],           // <1% network/5xx failures
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
    checks: ['rate>0.99'],                     // >99% checks pass
    // tagged thresholds per endpoint group, e.g.:
    'http_req_duration{group:market_read}': ['p(95)<500'],
    'http_req_duration{group:chat}': ['p(95)<8000'],   // LLM streaming is slow
  }
  ```
- Use `abortOnThreshold`/`abortOnFail` sparingly (only in stress "find the
  limit" runs) so a breach stops the run early.
- Add **custom metrics** (`Trend`, `Rate`, `Counter`) for domain signals, e.g.
  `chat_ttfb` (time-to-first-SSE-byte) and `rate_limited_rate` (429 share).

### 2.5 Data, tags, and modularization
- Load test data once with `SharedArray` (`k6/data`) so it isn't copied per VU.
- Tag requests/groups so thresholds can target endpoint groups
  (`http.get(url, { tags: { group: 'market_read' } })`).
- Modularize: put reusable scenario logic + helpers in a `lib/` folder and
  import into thin per-test-type entry files (k6 supports local ES module
  imports). This mirrors the k6 "start simple, modularize" guidance.
- jslib helpers you may use: `https://jslib.k6.io/k6-utils/1.4.0/index.js`
  (`randomItem`, `uuidv4`), and `https://jslib.k6.io/k6-summary/...` for custom
  end-of-test summaries (or use `handleSummary()`).

### 2.6 Streaming, SSE, WebSocket in k6
- **`/api/chat`** streams an SSE/UI-message stream. Plain `http.post` in k6 is
  **blocking** — it returns only after the whole response body is received, so
  `http_req_duration` for chat measures full-stream completion, not TTFB. That
  is acceptable for load, but to measure **time-to-first-token** use
  `http.post(url, body, { responseCallback })` is not enough; instead read the
  response as a stream via the experimental SSE module
  (`import sse from 'k6/x/sse'` requires an xk6 build) OR approximate TTFB by
  issuing a lightweight "prepare" request. Default plan: measure full-stream
  latency with a generous threshold, and record a custom `chat_stream_bytes`
  Counter. Mark true TTFB measurement as an OPTIONAL stretch (needs xk6-sse).
- **WebSocket**: use `k6/experimental/websockets` + `k6/experimental/timers` if
  you load-test any WS endpoint. The user-facing app's realtime path is SSE
  (`/api/market/stream`), not a user WS; the worker's SignalR is
  server-to-upstream. See Section 3.6.

### 2.7 CI actions (verified from Grafana repos)
- `grafana/setup-k6-action` — installs k6 (pin a version) in the runner.
- `grafana/run-k6-action` — runs k6 tests; supports glob `path`, `parallel`,
  `fail-fast`, extra `flags` (e.g. `--vus`, `--duration`, `--out`), and optional
  Grafana Cloud upload. Use it in the dedicated k6 workflow (Phase K9).

---

## 3. SYSTEM-UNDER-TEST (SUT) MAP — verified from source

### 3.1 Auth model (READ THIS BEFORE WRITING ANY REQUEST)
Every `/api/*` handler (except the exclusions below) requires an authenticated
user. Two enforcement layers, both in play:

1. **Edge middleware** (`apps/web/src/middleware.ts`):
   - Mints/refreshes a **CSRF double-submit cookie**: `hfx_csrf` in dev,
     `__Host-hfx_csrf` in production.
   - For **state-changing** methods (`POST/PUT/DELETE/PATCH`) on `/api/*`
     (except `/api/auth/*`), it **rejects with 403** unless the request carries
     header `x-csrf-token` **equal to** the CSRF cookie value.
   - Validates the NextAuth session (JWT cookie) and injects a **signed**
     `x-user-id` header (HMAC over `userId.requestId`) for downstream handlers.
   - **`matcher` exclusions** (NOT gated by middleware auth/CSRF):
     `auth`, `share`, `api/auth`, `api/dev`, `api/cron`, `api/telegram`,
     `api/billing/webhook`, static assets.
2. **Route handlers** (`apps/web/src/lib/api.ts` → `withAuth`): re-derive the
   user. Fast path trusts the signed `x-user-id` header (verifies HMAC); slow
   path calls NextAuth `auth()` (reads JWT cookie). If neither resolves → **401**.

**Consequence for k6:** to call authenticated endpoints you need EITHER a valid
NextAuth session cookie (Strategy B) OR the legacy bypass (Strategy A). See
Section 4.

3. **`AUTH_MODE=legacy` bypass** (`middleware.ts`, dev only —
   `NODE_ENV !== 'production'`): when set, middleware returns early injecting
   `x-user-id: __system__` and **skips both the CSRF check and the auth gate**.
   All requests are treated as the single user `__system__`. This is the
   simplest k6 auth strategy for a dedicated, non-prod load-test build.

### 3.2 CRON endpoints (bearer-token, no session)
`/api/cron/*` is excluded from middleware and protected by a `CRON_SECRET`
bearer token (see `turbo.json` globalEnv `CRON_SECRET`). These are heavy jobs
(snapshots, news, briefings, embeddings). **Do not** blast cron endpoints in
load tests except a dedicated, low-rate "cron burst" scenario with the correct
`Authorization: Bearer <CRON_SECRET>` header, and only against a throwaway DB.

### 3.3 Per-user rate limits (Postgres-backed, 1-minute fixed window)
`packages/db/src/rate-limit.ts` → `withRateLimit(userId, group, limit)` does an
atomic `INSERT ... ON CONFLICT DO UPDATE` on `rate_limits` keyed by
`(user_id, endpoint_group, date_trunc('minute', now()))`. **Rejected requests
still increment the counter.** Verified limits and their env overrides:

| endpoint group | default/min | env override | routes |
|---|---|---|---|
| `market_read` | 120 | `MARKET_READ_RATE_LIMIT` | `/api/market/{price,candles,indicators,structure,search}` |
| `news_read` | 60 | `NEWS_RATE_LIMIT` | `/api/news` |
| `sentiment_read` | 30 | `SENTIMENT_RATE_LIMIT` | `/api/sentiment` |
| `calendar_read` | 60 | `CALENDAR_RATE_LIMIT` | `/api/calendar` |
| `decision_signals` | 60 | `DECISION_SIGNALS_RATE_LIMIT` | `/api/decision-signals` |
| `ai_chat` | 30 | `AI_CHAT_RATE_LIMIT` | `/api/chat` |
| `ai_alert_preview` | 10 | `AI_ALERT_PREVIEW_RATE_LIMIT` | `/api/alerts/preview` |
| `ai_export` | 10 | `AI_EXPORT_RATE_LIMIT` | `/api/chat/threads/[id]/export` |
| `ai_bulk_delete` | 10 | `AI_BULK_DELETE_RATE_LIMIT` | `/api/chat/threads/bulk-delete` |
| `journal_import` | 5 | `JOURNAL_IMPORT_RATE_LIMIT` | `/api/journal/import` |
| `alerts_create` | 60 | (hardcoded) | `/api/alerts` POST |
| `push_subscribe` | 10 | (hardcoded) | `/api/push/subscribe` |
| `upload` | 20 | (hardcoded) | `/api/upload` |
| `bulk_test` | 2 | (hardcoded) | `/api/settings/bulk-test` |

**CRITICAL k6 implication:** because the limit is **per user**, a load test that
authenticates as ONE user will start returning **429** almost immediately (e.g.
>120 market reads/min). Two mitigations, both required in the plan:
- **Multi-user fan-out (Strategy B):** seed N test users; each VU picks a
  different user so the per-user buckets don't saturate. This is the *realistic*
  load model.
- **Rate-limit lift for the load-test env:** in the dedicated SUT, set the
  `*_RATE_LIMIT` envs very high (e.g. `MARKET_READ_RATE_LIMIT=100000`) so the
  limiter doesn't mask real throughput ceilings. Do this ONLY in the throwaway
  load-test environment, never in prod. The k6 tests must still explicitly
  **count 429s** via a custom `Rate` metric and threshold it (e.g.
  `rate_limited < 0.02`) so a misconfigured env is caught.

### 3.4 Primary load-test targets (GET, read-heavy — start here)
| endpoint | method | key query params | notes |
|---|---|---|---|
| `/api/health` | GET | — | wrapped in `withAuth`; checks db+env+pgvector+cron. Good deep health probe. Requires auth. |
| `/api/health/db` | GET | — | connectivity + migration count. Requires auth. |
| `/api/market/price` | GET | `?symbol=XAUUSD` (CSV or repeated) | rate group `market_read`. Hits provider/cache. |
| `/api/market/candles` | GET | `?symbol=&timeframe=` | `market_read`. |
| `/api/market/indicators` | GET | `?symbol=&timeframe=` | `market_read`, CPU-ish. |
| `/api/market/structure` | GET | `?symbol=&timeframe=` | `market_read`, SMC compute. |
| `/api/market/search` | GET | `?q=` | `market_read`. |
| `/api/news` | GET | — | `news_read`. |
| `/api/calendar` | GET | — | `calendar_read`. |
| `/api/sentiment` | GET | `?symbol=` | `sentiment_read`. |
| `/api/decision-signals` | GET | — | `decision_signals`. |
| `/api/chat/threads` | GET | — | list threads; DB read (RLS-scoped). |

### 3.5 Heavy / write / streaming targets (later phases, careful)
- `/api/chat` — **POST**, streaming SSE, `maxDuration=60`, `ai_chat` limit 30/min,
  body: `{ threadId: uuid, messages: [{id, role:'user', content, parts}] }`.
  Requires a **real thread owned by the user** (handler calls `getThread` and
  404s otherwise). Also needs CSRF header. Runs the LLM → **costs money** and is
  slow; load-test with a stubbed/cheap model or a dedicated "mock LLM" mode if
  one exists, otherwise keep VUs low and treat as a latency-profile test, not a
  throughput test. Confirm cost controls before running (see Section 4.4).
- `/api/market/stream` — **GET**, SSE (`export const GET = async` — note this
  one is NOT wrapped in `withAuth`; verify current source). Long-lived; use the
  SSE/streaming approach from Section 2.6, cap concurrent streams.
- `/api/upload` — POST multipart, `upload` limit 20/min.
- POST/PUT/DELETE routes (alerts, journal, portfolio, settings) — all require
  the **CSRF header**; only include in write-mix scenarios against a throwaway DB.

### 3.6 The worker (`apps/worker`)
Not an end-user HTTP server. It connects **outbound** to a SignalR tick hub and
writes to Postgres. There is no user-facing socket to hammer with k6. Load on
the worker is *indirect* (DB write pressure, tick volume). **Do NOT invent a k6
WebSocket test against the worker.** If worker load characterization is later
desired, it is a separate effort (feed synthetic ticks to its SignalR consumer
in a harness) and is **out of scope** for this plan. Note this explicitly in the
docs (Phase K11) so no one assumes k6 covers the worker.

---

## 4. AUTH & CSRF STRATEGY FOR k6 (the hard part — decide up front)

Implement **both** strategies behind a single env flag `K6_AUTH_MODE` so tests
are portable. Default to Strategy A locally, Strategy B for realistic runs.

### 4.1 Strategy A — `legacy` bypass (simplest; single synthetic user)
Run the SUT with `AUTH_MODE=legacy` and `NODE_ENV` != `production` (e.g.
`development`, or a `production` build with a deliberate non-prod NODE_ENV in the
throwaway env — verify the guard: legacy is refused when `NODE_ENV==='production'`).
Then k6 needs **no cookies and no CSRF** — middleware injects
`x-user-id: __system__` and skips the CSRF gate. All traffic is one user, so you
MUST lift the `*_RATE_LIMIT` envs (Section 3.3). Best for: local dev smoke,
CPU/latency profiling of read endpoints, CI on an ephemeral SUT.

### 4.2 Strategy B — real NextAuth sessions (realistic; N users)
Mirror what Playwright's `auth-setup.ts` does, but from k6:
1. **Seed users out-of-band** (before k6 runs) — add a small Node seeding script
   (Phase K1, `lib/seed/seed-users.mjs`, runs in Node not k6) that inserts N
   users (`loadtest+000@hamafx.ai` … `loadtest+NNN@hamafx.ai`) with a known
   bcrypt password, and creates **one chat thread per user** (needed for
   `/api/chat`). Reuse the credentials provider password path (`bcrypt.hash`,
   cost 12) exactly as `dev/login/route.ts` does. This script uses the real
   `@hamafx/db` from Node — it is NOT a k6 script.
2. **Log in inside k6 `setup()`** to obtain session cookies: POST the NextAuth
   credentials callback (`/api/auth/callback/credentials`) with the CSRF token
   from `/api/auth/csrf`, following redirects, and capture the
   `authjs.session-token` (dev) / `__Secure-authjs.session-token` (prod) cookie
   from the k6 cookie jar. Store one cookie per seeded user in the `setup()`
   return value (an array). k6 maintains a per-VU cookie jar; set the session
   cookie via `http.cookieJar().set(baseUrl, name, value)` at the start of each
   iteration, selecting a user by `__VU`/`__ITER`.
   - **CSRF for app POSTs:** after login, do one GET (any page or `/api/health`)
     to receive the `hfx_csrf` cookie, read it from the jar, and send it as the
     `x-csrf-token` header on every state-changing `/api/*` request.
   - If the credentials-callback handshake proves brittle from k6, fall back to
     minting a valid session JWT in the Node seed script and injecting it as the
     cookie in `setup()` (document whichever path you implement).
3. **Distribute load across users** so per-user rate limits reflect reality; you
   generally will NOT lift `*_RATE_LIMIT` in Strategy B (you want to observe the
   real limiter), but the tests must still count 429s.

### 4.3 Symbols & fixtures
Valid symbols come from the app's `SYMBOLS`/`SymbolSchema` (see
`apps/web/src/app/api/market/price/route.ts` imports). Do NOT hardcode a guess.
In Phase K1, extract the allowed symbol list from source (or from a running
`/api/settings/symbols` response captured once) into
`loadtest/lib/data/symbols.json`. `XAUUSD` and `EURUSD` are known-valid examples
used throughout the codebase/tests.

### 4.4 Cost & safety guard for `/api/chat`
`/api/chat` runs the real AI agent (LLM calls cost money and can be slow/rate
limited upstream). Before any chat load run:
- Confirm the SUT is configured with a cheap/stub model (check `.env.example`
  `AI_DEFAULT_MODEL` and whether a mock/stub provider exists in `@hamafx/ai`;
  if none, keep chat VUs ≤ 5 and iterations bounded).
- Never run chat load against production or a shared dev DB.
- Keep the `ai_chat` limit at its default in Strategy B so you also validate the
  limiter path (expect and threshold some 429s).

---

## 5. PROTECTED INVARIANTS & GLOBAL EXECUTION PROTOCOL

### 5.1 Protected invariants — DO NOT REGRESS
1. `pnpm turbo run build | lint | typecheck | test -- --run` all stay green.
2. No new dependency is added to any existing `package.json` `dependencies`
   (k6 is a system binary + a standalone TS project; its `@types/k6` and
   `typescript` live in an **isolated** `loadtest/package.json` that is NOT part
   of the pnpm workspace — see Phase K0.3).
3. `pnpm-workspace.yaml` is **not** modified to include `loadtest/` (keep k6 out
   of the workspace so it can't pollute app builds/CI).
4. `ci-fast.yml` (PR CI) is unchanged. k6 never gates PRs.
5. `turbo.json` existing tasks are unchanged. (You MAY add a new non-cached
   `loadtest` passthrough only if truly needed; prefer plain npm scripts.)
6. No app runtime code (`apps/**`, `packages/**` source) is modified, except the
   optional, clearly-scoped rate-limit env plumbing which already exists via
   `process.env` (no code change needed — it's all env-driven).
7. Secrets (`CRON_SECRET`, DB creds, session secrets) are never committed. k6
   reads them from env (`__ENV`) / CI secrets only.

### 5.2 Change discipline
- One work order = one commit. Conventional-commit style, matching repo history
  (e.g. `feat(loadtest): ...`, `chore(ci): ...`, `docs: ...`).
- Keep k6 scripts strictly typed; run the isolated `tsc --noEmit` before commit.
- Every k6 test file MUST define `options.thresholds` (no thresholds = not a
  real gate) and use tagged groups.

### 5.3 Global verification suite (run after every work order)
```bash
# 1. Repo stays green (nothing k6 touched app code):
pnpm install --frozen-lockfile
pnpm turbo run typecheck
pnpm turbo run lint
pnpm turbo run build
pnpm turbo run test -- --run
# 2. k6 project type-checks (from loadtest/):
cd loadtest && npm run typecheck && cd ..
# 3. k6 scripts parse & options validate WITHOUT generating load:
#    (k6 inspect / --no-thresholds smoke with 1 iter against a local SUT)
k6 inspect loadtest/tests/smoke-market-read.ts   # after Phase K3
```
A work order is DONE only when 5.3 passes.

---

## 6. WORK ORDERS

> All k6 assets live under a new top-level `loadtest/` directory, isolated from
> the pnpm workspace. Target final layout:
>
> ```
> loadtest/
>   package.json            # isolated (NOT in pnpm-workspace), deps: typescript, @types/k6
>   tsconfig.json           # types: ["k6"], noEmit
>   .gitignore              # results/, *.summary.json, node_modules/
>   README.md               # how to run (Phase K11 fills this)
>   config/
>     environments.ts       # baseUrl + knobs per env (local/ci/staging) via __ENV
>     thresholds.ts         # reusable threshold presets
>     load-profiles.ts      # reusable executor/stage presets (smoke/avg/stress/spike/soak)
>   lib/
>     http.ts               # authed request helpers + tagging + 429 metric
>     auth.ts               # Strategy A/B session + CSRF acquisition
>     metrics.ts            # custom Trend/Rate/Counter definitions
>     checks.ts             # reusable check helpers
>     data/
>       symbols.json        # valid market symbols
>     seed/
>       seed-users.mjs      # Node (not k6) seeding script for Strategy B
>   scenarios/
>     market-read.ts        # reusable VU function for market read mix
>     read-mix.ts           # broad read endpoint mix
>     chat.ts               # chat POST scenario (guarded)
>   tests/
>     smoke-market-read.ts
>     smoke-read-mix.ts
>     load-market-read.ts
>     load-read-mix.ts
>     stress-market-read.ts
>     spike-read-mix.ts
>     soak-read-mix.ts
>     load-chat.ts
> ```

### PHASE K0 — BOOTSTRAP THE k6 PROJECT

#### K0.1 — Create the isolated `loadtest/` project skeleton
**Required change:** create `loadtest/` with `package.json`, `tsconfig.json`,
`.gitignore`.
- `loadtest/package.json` (isolated; private; NOT referenced by root workspace):
  ```json
  {
    "name": "hamafx-loadtest",
    "version": "0.0.0",
    "private": true,
    "type": "module",
    "scripts": {
      "typecheck": "tsc --noEmit",
      "smoke": "k6 run tests/smoke-read-mix.ts",
      "load": "k6 run tests/load-read-mix.ts",
      "stress": "k6 run tests/stress-market-read.ts",
      "spike": "k6 run tests/spike-read-mix.ts",
      "soak": "k6 run tests/soak-read-mix.ts",
      "seed": "node lib/seed/seed-users.mjs"
    },
    "devDependencies": {
      "@types/k6": "^0.57.0",
      "typescript": "^5.7.2"
    }
  }
  ```
- `loadtest/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2020",
      "module": "ES2020",
      "moduleResolution": "bundler",
      "types": ["k6"],
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "resolveJsonModule": true
    },
    "include": ["config/**/*.ts", "lib/**/*.ts", "scenarios/**/*.ts", "tests/**/*.ts"]
  }
  ```
- `loadtest/.gitignore`: `node_modules/`, `results/`, `*.summary.json`,
  `*.junit.xml`, `.env`, `.env.local`.

**Local verification:** `cd loadtest && npm install && npm run typecheck`
(no source files yet → passes trivially once one placeholder exists; add
`config/environments.ts` from K1.1 first if tsc errors on empty include).
**Commit:** `chore(loadtest): scaffold isolated k6 typescript project`

#### K0.2 — Do NOT add loadtest to the pnpm workspace
**Evidence:** `pnpm-workspace.yaml` lists `apps/*`, `packages/*`,
`packages/test-utils`. **Required change:** leave it unchanged. Add a top-level
`.gitignore` entry (root `.gitignore`) for `loadtest/results/` and
`loadtest/node_modules/` if not already covered. Verify `pnpm install` at repo
root does NOT pick up `loadtest/` (it must not).
**Commit:** `chore(loadtest): keep k6 project out of pnpm workspace`

#### K0.3 — Document local k6 install (no repo change beyond README stub)
k6 is a binary, not an npm dep. Document install (macOS `brew install k6`,
Linux via the k6 apt repo, or `docker run grafana/k6`). Pin **k6 ≥ v0.57.0**.
This is captured in `loadtest/README.md` in Phase K11; create a one-line stub
now.
**Commit:** `docs(loadtest): note k6 v0.57+ binary requirement`

### PHASE K1 — SHARED CONFIG, LIBS & TEST DATA

#### K1.1 — `config/environments.ts`
Central env resolution from `__ENV` (k6 injects `-e KEY=val` and OS env here).
```ts
// loadtest/config/environments.ts
export interface Env {
  baseUrl: string;                 // K6_BASE_URL, e.g. http://localhost:3000
  authMode: 'legacy' | 'session';  // K6_AUTH_MODE
  userCount: number;               // K6_USER_COUNT (Strategy B)
  password: string;                // K6_TEST_PASSWORD (Strategy B)
  cronSecret?: string;             // K6_CRON_SECRET (only for cron scenario)
}
const E = (k: string, d?: string) => (__ENV[k] ?? d) as string;
export const env: Env = {
  baseUrl: E('K6_BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  authMode: (E('K6_AUTH_MODE', 'legacy') as Env['authMode']),
  userCount: parseInt(E('K6_USER_COUNT', '10'), 10),
  password: E('K6_TEST_PASSWORD', 'LoadTest!123'),
  cronSecret: __ENV['K6_CRON_SECRET'],
};
```

#### K1.2 — `config/thresholds.ts` (reusable presets)
Export named threshold objects so every test imports the same SLOs. Include
global (`http_req_failed`, `checks`) plus per-group tagged thresholds for
`market_read`, `read_mix`, `chat`. Add a `rate_limited` custom-metric threshold.
Values (starting points; tune after first baseline):
- `market_read`: `p(95)<500`, `p(99)<1200`
- `read_mix`: `p(95)<800`, `p(99)<1800`
- `chat`: `p(95)<10000` (full stream), and custom `chat_ttfb p(95)<2500` if TTFB is measured
- global: `http_req_failed rate<0.01`, `checks rate>0.99`, `rate_limited rate<0.02` (Strategy A) / document expected-nonzero for Strategy B.

#### K1.3 — `config/load-profiles.ts` (reusable executors)
Export scenario/executor presets so the per-type test files stay thin:
- `smoke`: `per-vu-iterations`, 1 VU, 3 iters.
- `average`: `ramping-arrival-rate`, warmup→steady→ramndown stages targeting the
  endpoint's realistic RPS (below the rate-limit ceiling in Strategy A only if
  limits lifted; otherwise scaled by userCount). `preAllocatedVUs`/`maxVUs` set.
- `stress`: `ramping-arrival-rate` climbing past average until thresholds break;
  optionally `abortOnFail` on `http_req_failed`.
- `spike`: `ramping-vus` or `ramping-arrival-rate` with a sharp 0→peak→0 in ~2m.
- `soak`: `constant-arrival-rate` at ~average load for 1h+ (parametrize duration
  via `K6_SOAK_DURATION`, default `1h`).

Each preset accepts an `exec` name so multiple scenarios can share one file.

#### K1.4 — `lib/metrics.ts`
Define custom metrics used across tests:
```ts
import { Trend, Rate, Counter } from 'k6/metrics';
export const rateLimited = new Rate('rate_limited');          // share of 429s
export const chatTtfb = new Trend('chat_ttfb', true);         // ms
export const chatStreamBytes = new Counter('chat_stream_bytes');
export const authFailures = new Counter('auth_failures');
```

#### K1.5 — `lib/checks.ts`
Reusable `check()` helpers: `expectOk(res)` (status 200 & valid JSON),
`expectStatus(res, codes[])`, and a `record429(res)` that feeds `rateLimited`.
Never let a 429 count as a hard failure inside `checks` when the limiter is the
subject under test; instead record it in the `rate_limited` metric.

#### K1.6 — `lib/auth.ts` (implements both strategies from Section 4)
- `bootstrapAuth(): SessionCtx[]` — called in `setup()`.
  - Strategy A (`legacy`): returns a single ctx `{ headers: {} }` (no cookies,
    no CSRF needed); the SUT must run with `AUTH_MODE=legacy`.
  - Strategy B (`session`): for each of `env.userCount` users, perform the
    NextAuth credentials login handshake (GET `/api/auth/csrf` → POST
    `/api/auth/callback/credentials`), capture the session cookie, then GET once
    to obtain the `hfx_csrf` cookie; return `{ cookies, csrfToken }` per user.
- `applyAuth(ctx)` — called at the top of each VU iteration: for Strategy B, set
  the session cookie into the per-VU cookie jar and return the
  `{ 'x-csrf-token': ctx.csrfToken }` header for writes.
- `pickUser(ctxs)` — deterministic user selection by `__VU`/`__ITER` so load
  spreads across seeded users.

#### K1.7 — `lib/http.ts`
Thin wrappers over `k6/http` that (a) prefix `env.baseUrl`, (b) attach auth
headers, (c) tag every request with `{ group }`, (d) run `record429`, and
(e) run `expectOk`/`expectStatus`. Example: `getJson(path, group, extraHeaders)`
and `postJson(path, group, body, extraHeaders)` (postJson auto-adds
`x-csrf-token`).

#### K1.8 — `lib/data/symbols.json`
Populate with the app's valid symbols (extract from source — do not guess).
Minimum viable: `["XAUUSD","EURUSD","GBPUSD","USDJPY","BTCUSD"]` filtered to
whatever `SymbolSchema` accepts. Loaded via `SharedArray` in scenarios.

#### K1.9 — `lib/seed/seed-users.mjs` (Node, Strategy B only)
A standalone Node ESM script (run with repo Node, NOT k6) that:
- imports `getDb`, `schema` from `@hamafx/db` (invoke via `node` from repo root
  with the workspace built, or via `tsx`),
- upserts `env.K6_USER_COUNT` users `loadtest+NNN@hamafx.ai` with
  `bcrypt.hash(K6_TEST_PASSWORD, 12)` (mirror `dev/login/route.ts`),
- creates one chat thread per user (needed for `/api/chat`) and writes a
  `loadtest/lib/data/seeded-users.json` manifest (emails + threadIds) consumed
  by k6 `setup()`.
- Is idempotent (skip existing). Guard with a `K6_ALLOW_SEED=true` check and a
  refusal if `DATABASE_URL` points at anything not clearly a load-test DB.

**Local verification (Phase K1):** `cd loadtest && npm run typecheck` passes;
`k6 inspect tests/…` (after K3) validates options. Global suite 5.3 green.
**Commit:** `feat(loadtest): shared config, auth harness, metrics and data libs`

### PHASE K2 — REUSABLE SCENARIOS (VU logic, no `options`)

#### K2.1 — `scenarios/market-read.ts`
Export a function `marketRead(ctx)` that, per iteration, picks a random symbol
(`randomItem` from k6-utils over the `SharedArray` symbols) and issues a small
weighted mix of the five `market_read` GETs (price/candles/indicators/
structure/search) via `lib/http.getJson(..., 'market_read')`, then `sleep()` a
randomized think-time (e.g. `0.5–2s`). No `options` here — entry files own them.

#### K2.2 — `scenarios/read-mix.ts`
Export `readMix(ctx)` covering the broad read surface (Section 3.4): market mix +
`/api/news` + `/api/calendar` + `/api/sentiment` + `/api/decision-signals` +
`/api/chat/threads` + `/api/health`, each tagged with its own group, weighted to
resemble a browsing user. Include think-time.

#### K2.3 — `scenarios/chat.ts` (guarded)
Export `chatTurn(ctx)` that POSTs `/api/chat` with a valid body
(`{ threadId: ctx.user.threadId, messages:[{id:uuidv4(), role:'user',
content:'What is XAUUSD doing?', parts:[]}] }`), tagged `group:'chat'`, with the
CSRF header. Read the streamed body; record `chat_stream_bytes`; treat 429 via
`record429`. Keep it defensive (skip if `ctx.user.threadId` missing).
**Commit:** `feat(loadtest): reusable market-read, read-mix and chat scenarios`

### PHASE K3 — SMOKE TESTS (run these first, always)

#### K3.1 — `tests/smoke-read-mix.ts` & `tests/smoke-market-read.ts`
Thin entry files: import the scenario + the `smoke` profile + thresholds.
`options` uses `per-vu-iterations` (1 VU, 3 iters), a strict `http_req_failed:
['rate<0.01']`, `checks: ['rate>0.99']`. Implement `setup()` → `bootstrapAuth()`,
`default(data)` → apply auth + call scenario, `teardown()` no-op.
Add `handleSummary()` to also emit `results/<test>.summary.json` and a JUnit XML
(via jslib or manual) for CI artifacts.
**Local verification:**
```bash
# start a SUT first (Strategy A):
AUTH_MODE=legacy MARKET_READ_RATE_LIMIT=100000 pnpm --filter @hamafx/web dev &
cd loadtest && k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=legacy tests/smoke-read-mix.ts
```
Expect: exit 0, 0 failed checks, no 429s.
**Commit:** `feat(loadtest): smoke tests for read endpoints`

### PHASE K4 — AVERAGE-LOAD TESTS (baseline for regressions)

#### K4.1 — `tests/load-market-read.ts` & `tests/load-read-mix.ts`
Use the `average` profile (`ramping-arrival-rate`: e.g. ramp 0→N rps over 1m,
hold N rps for 3–5m, ramp down 1m). Import the per-group tagged thresholds from
`config/thresholds.ts`. Choose N:
- Strategy A (limits lifted): push until you find the natural latency knee; start
  N=50 rps and iterate.
- Strategy B (real limits, N users): keep aggregate rps below
  `userCount * (limit/60)` so 429s stay near-zero, and assert `rate_limited`.
Record the baseline `results/*.summary.json` and note p95/p99 in the log.
**Local verification:** run against a SUT; thresholds pass; capture baseline.
**Commit:** `feat(loadtest): average-load tests with SLO thresholds`

### PHASE K5 — STRESS TESTS (find the breaking point)

#### K5.1 — `tests/stress-market-read.ts`
`ramping-arrival-rate` climbing well past average (e.g. steps 50→100→200→400 rps),
`abortOnFail` on `http_req_failed: ['rate<0.05']` so the run stops when the SUT
breaks. The GOAL is to observe the failure point, not to pass — document the max
sustained rps and the failure mode (timeouts vs 5xx vs 429). Mark this test
`--no-thresholds`-friendly (thresholds present but expected to break at the top).
**Commit:** `feat(loadtest): stress test to locate throughput ceiling`

### PHASE K6 — SPIKE & SOAK TESTS

#### K6.1 — `tests/spike-read-mix.ts`
`ramping-arrival-rate` (or `ramping-vus`) with a sharp 0→peak (e.g. 300 rps in
20s), hold 1m, drop to 0. Threshold on recovery: `http_req_failed rate<0.05`
during the whole run; assert the system recovers (post-spike p95 returns to
baseline). Records a `recovered` custom check.

#### K6.2 — `tests/soak-read-mix.ts`
`constant-arrival-rate` at ~average load for `K6_SOAK_DURATION` (default `1h`,
override in CI to shorter). Purpose: detect memory leaks / latency creep / DB
connection exhaustion over time. Threshold: latency p95 must not drift upward >X%
between the first and last 10-minute windows (implement via tagged time buckets
or just record and inspect the trend). Never run soak in PR/regular CI; nightly
or manual only.
**Commit:** `feat(loadtest): spike and soak tests`

### PHASE K7 — CHAT / STREAMING LOAD (guarded, cost-aware)

#### K7.1 — `tests/load-chat.ts`
Import `scenarios/chat.ts`. Because `/api/chat` is slow (LLM) and limited to
30/min/user, model it with **low concurrency** (`constant-vus` 3–10, or
`constant-arrival-rate` a few iters/min) over a short duration. Thresholds:
`group:chat` full-stream `p(95)<10000` (tune), `http_req_failed rate<0.02`,
and record `chat_stream_bytes>0`. REQUIRE `K6_ENABLE_CHAT=true` env to run (guard
against accidental cost). Prefer a stub/cheap model in the SUT (Section 4.4).
Document the TTFB-via-xk6-sse stretch option but do not require an xk6 build.
**Local verification:** run only with `K6_ENABLE_CHAT=true` against a SUT using a
cheap model; a real thread per user must exist (seed script). Confirm 200s and
non-empty streams; expect some 429s at the 30/min ceiling in Strategy B.
**Commit:** `feat(loadtest): guarded chat streaming load test`

### PHASE K8 — DEDICATED SUT ENVIRONMENT (throwaway, reproducible)

#### K8.1 — `loadtest/docker-compose.loadtest.yml`
Provide a self-contained SUT for local + CI load runs. Model it on the root
`docker-compose.yml` services (`db: pgvector/pgvector:pg16`, `app`, `worker`) but:
- Use an **ephemeral** DB (no persistent volume, or a throwaway volume).
- Set `AUTH_MODE=legacy` (Strategy A) OR provide the session-secrets for
  Strategy B.
- Set all `*_RATE_LIMIT` envs high (Strategy A) via an env block, and set a
  cheap/stub `AI_*_MODEL` if chat load is enabled.
- Run migrations before the app starts (reuse `scripts/predeploy-migrate.mjs` /
  the app's `docker-entrypoint.sh`).
- Expose the app on `:3000`.
Do NOT couple this to the production compose file; keep it under `loadtest/`.
**Local verification:** `docker compose -f loadtest/docker-compose.loadtest.yml up -d`
then `curl -fsS localhost:3000/api/health` returns 200 (Strategy A) — note health
needs auth, so in legacy mode `x-user-id:__system__` is injected and it should
pass; if health still 401s, hit a legacy-bypassed read endpoint to confirm boot.
**Commit:** `feat(loadtest): dockerized throwaway SUT for load runs`

#### K8.2 — Seeding hook for Strategy B
Wire `npm run seed` (K1.9) to run against the compose DB before Strategy B runs.
Document the exact command sequence in the README (Phase K11).
**Commit:** `feat(loadtest): seed step for session-based load runs`

### PHASE K9 — CI INTEGRATION (dedicated workflow, never gates PRs)

#### K9.1 — `.github/workflows/loadtest.yml`
New workflow, **separate** from `ci-fast`/`ci-slow`. Triggers:
- `workflow_dispatch` (manual, with inputs: `test` glob, `authMode`, `duration`).
- `schedule` nightly (e.g. `0 3 * * *`) — offset from the existing `0 0 * * *`
  eval cron so they don't contend.
Job outline:
```yaml
name: loadtest
on:
  workflow_dispatch:
    inputs:
      test: { description: "glob for test files", default: "loadtest/tests/smoke-*.ts" }
      authMode: { description: "legacy|session", default: "legacy" }
  schedule:
    - cron: '0 3 * * *'
concurrency: { group: loadtest-${{ github.ref }}, cancel-in-progress: true }
jobs:
  k6:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @hamafx/web build   # build the SUT
      # bring up throwaway SUT (compose) OR start app with AUTH_MODE=legacy + high limits
      - name: Start SUT
        run: docker compose -f loadtest/docker-compose.loadtest.yml up -d --wait
      - name: Seed users (session mode only)
        if: ${{ inputs.authMode == 'session' }}
        run: cd loadtest && K6_ALLOW_SEED=true npm run seed
      - uses: grafana/setup-k6-action@v1
        with: { k6-version: '0.57.0' }
      - uses: grafana/run-k6-action@v1
        with:
          path: ${{ inputs.test || 'loadtest/tests/smoke-*.ts' }}
          flags: >-
            -e K6_BASE_URL=http://localhost:3000
            -e K6_AUTH_MODE=${{ inputs.authMode || 'legacy' }}
          fail-fast: true
      - name: Upload k6 results
        if: always()
        uses: actions/upload-artifact@v4
        with: { name: k6-results, path: loadtest/results/, retention-days: 30 }
```
- **Nightly run** should execute smoke + average-load (fast, deterministic-ish),
  NOT stress/soak (those are `workflow_dispatch` only, or a weekly cron with a
  longer timeout).
- Secrets (DB creds, session secrets, `K6_TEST_PASSWORD`, any cheap-model API
  key) come from **GitHub Actions secrets**, injected as env — never inline.
- Optional: if a Grafana Cloud k6 token exists, add
  `cloud-run-locally: true` to stream results; otherwise keep local output +
  artifacts.
**Local verification:** `act`-style dry run not required; validate YAML with
`yamllint`/GitHub's editor. Confirm `ci-fast.yml` and `ci-slow.yml` are
**unchanged** (diff them).
**Commit:** `chore(ci): add dedicated nightly/manual k6 loadtest workflow`

### PHASE K10 — REPORTING, THRESHOLD GATING & OUTPUT

#### K10.1 — `handleSummary()` standardization
Add a shared `lib/summary.ts` exporting a `handleSummary` that writes:
- `results/<testname>-<timestamp>.summary.json` (machine-readable),
- `results/<testname>-<timestamp>.junit.xml` (for CI test reporting),
- stdout text summary (default).
Import and re-export it from each test file. This makes every run produce
uploadable artifacts (mirrors how Playwright uploads reports in CI).

#### K10.2 — Baseline capture & regression note
Document (in README) how to store a baseline summary and compare p95/p99 across
runs. Optionally add a tiny Node comparator (`lib/compare-baseline.mjs`) that
diffs two summary JSONs and exits non-zero if p95 regresses > a configurable %.
Keep it OUT of the k6 runtime (it's a Node post-step). This is OPTIONAL/stretch.
**Commit:** `feat(loadtest): standardized summaries and optional baseline diff`

### PHASE K11 — DOCUMENTATION

#### K11.1 — `loadtest/README.md`
Full run guide: k6 install (v0.57+), the two auth strategies, how to boot the
SUT (compose), how to seed users, how to run each test type, env var reference
(`K6_*`, `*_RATE_LIMIT`), how to read summaries, and the explicit statement that
**the worker and cron are out of scope** (Section 3.6/3.2).

#### K11.2 — Update `docs/09-testing.md`
Add a "Load & Performance Testing (k6)" section that: (a) states k6 covers
backend HTTP load (distinct from Vitest correctness, Playwright UX, Lighthouse
front-end vitals), (b) links to `loadtest/README.md`, (c) documents the nightly
workflow. Keep counts accurate; do not overstate coverage.
**Commit:** `docs: document k6 load testing suite and workflow`

---

## 7. EXECUTION ORDER & DEPENDENCY GRAPH

```
K0 (bootstrap)
  └─> K1 (config/libs/data/seed)
        ├─> K2 (scenarios)
        │     ├─> K3 (smoke)          <-- run + validate against a local SUT FIRST
        │     │     └─> K4 (average-load, capture baseline)
        │     │           ├─> K5 (stress)
        │     │           └─> K6 (spike, soak)
        │     └─> K7 (chat/streaming, guarded)   [needs K1.9 seed for Strategy B]
        └─> K8 (dockerized SUT)  [needed to run K3+ in CI; can be built in parallel with K2]
K8 + K3/K4 ──> K9 (CI workflow)
K3..K7 ──────> K10 (reporting/summaries)  [K10.1 can land early and be adopted by each test]
everything ──> K11 (docs)
```

Rules:
- Do **K3 (smoke) and validate against a real running SUT** before writing K4+.
  A smoke test that can't authenticate/reach the app means the auth harness
  (K1.6) is wrong — fix it before scaling load.
- K10.1 (`handleSummary`) is best landed right after K3 so every later test
  adopts it; if you defer it, retrofit all test files in K10.
- Stress/soak (K5/K6) are never in the nightly gate; wire them to
  `workflow_dispatch` / weekly only.

---

## 8. DEFINITION OF DONE (whole plan)

1. `loadtest/` exists as an isolated TS project; `cd loadtest && npm run typecheck`
   passes; k6 (v0.57+) runs the `.ts` files directly.
2. `pnpm-workspace.yaml`, `ci-fast.yml`, `ci-slow.yml`, `turbo.json`, and all
   `apps/**` + `packages/**` source are **unchanged** by this work (verify via
   `git diff --stat` — only additions under `loadtest/`, a new
   `.github/workflows/loadtest.yml`, edits to `docs/09-testing.md`, root
   `.gitignore`, and the two log/plan md files).
3. Root `pnpm install && pnpm turbo run build|lint|typecheck|test -- --run` all
   green (k6 added nothing to the workspace).
4. Smoke, average-load, stress, spike, soak, and (guarded) chat tests all exist,
   each with `options.thresholds` and tagged groups, and each runnable via
   `k6 run` against the dockerized SUT.
5. Both auth strategies work: Strategy A (legacy bypass) and Strategy B (seeded
   users + real session cookie + CSRF).
6. `.github/workflows/loadtest.yml` runs smoke+average nightly and supports
   manual dispatch of any test; it uploads `loadtest/results/` artifacts; it does
   NOT gate PRs.
7. Every test emits a JSON + JUnit summary via the shared `handleSummary`.
8. `loadtest/README.md` + `docs/09-testing.md` document usage, the auth
   strategies, rate-limit tuning, and the worker/cron out-of-scope note.
9. `/K6_LOAD_TESTING_LOG.md` has a status line per work order.
10. No secrets committed anywhere.

---

## 9. EVIDENCE INDEX (verified file references — re-confirm before editing)

- Monorepo/testing config: `package.json` (root scripts: `test`, `test:e2e`,
  `test:empty-guard`), `turbo.json` (tasks + `globalEnv` incl. `CRON_SECRET`),
  `pnpm-workspace.yaml`, `vitest.workspace.ts`, `vitest.config.ts`.
- Existing testing docs: `docs/09-testing.md`, `docs/e2e-testing.md`.
- CI: `.github/workflows/ci-fast.yml`, `.github/workflows/ci-slow.yml`
  (`nightly-eval` pattern to mirror).
- Auth/CSRF/user injection: `apps/web/src/middleware.ts` (CSRF cookie
  `hfx_csrf`/`__Host-hfx_csrf`, `x-csrf-token` check, `AUTH_MODE=legacy` bypass,
  matcher exclusions), `apps/web/src/lib/api.ts` (`withAuth`,
  `getUserFromRequest`, signed `x-user-id`).
- Dev login reference for seeding: `apps/web/src/app/api/dev/login/route.ts`
  (bcrypt cost 12, credentials sign-in), `apps/web/tests/e2e/auth-setup.ts`
  (`ensureTestUser`, credentials login flow).
- Rate limits: `packages/db/src/rate-limit.ts` (`withRateLimit`, 1-min window),
  and per-route limits (`apps/web/src/app/api/**/route.ts`) — see Section 3.3.
- Health targets: `apps/web/src/app/api/health/route.ts`,
  `apps/web/src/app/api/health/db/route.ts`.
- Chat target: `apps/web/src/app/api/chat/route.ts` (POST, `withRateLimit
  ai_chat` default 30, body schema `{threadId, messages[]}`, `maxDuration=60`,
  `getThread` ownership check).
- Market target + symbols: `apps/web/src/app/api/market/price/route.ts`
  (`SymbolSchema`, `SYMBOLS`, `MARKET_READ_RATE_LIMIT`).
- Streaming: `apps/web/src/app/api/market/stream/route.ts` (SSE GET).
- Envs: `.env.example` (`AUTH_MODE`, `ENABLE_DEV_LOGIN`, `NEXTAUTH_URL`,
  `DATABASE_URL`, `CRON_SECRET`, `*_RATE_LIMIT`, `AI_*_MODEL`).
- Compose model for SUT: root `docker-compose.yml` (`db: pgvector/pgvector:pg16`,
  `app`, `worker`), `apps/web/docker-entrypoint.sh`,
  `scripts/predeploy-migrate.mjs`.
- k6 doc facts used (re-verify against current docs before implementing):
  native TS in v0.57+ (`--compatibility-mode` note),
  executors list (constant/ramping arrival-rate),
  thresholds vs checks, test types (smoke/average/stress/spike/soak),
  `grafana/setup-k6-action` + `grafana/run-k6-action`.

---

## 10. APPENDIX A — MINIMAL SMOKE TEST REFERENCE (illustrative, not final)

```ts
// loadtest/tests/smoke-read-mix.ts  (native TS, run: k6 run tests/smoke-read-mix.ts)
import { sleep } from 'k6';
import { env } from '../config/environments.ts';
import { bootstrapAuth, applyAuth, pickUser } from '../lib/auth.ts';
import { readMix } from '../scenarios/read-mix.ts';
import { handleSummary } from '../lib/summary.ts';

export const options = {
  scenarios: {
    smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 3, maxDuration: '1m' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    rate_limited: ['rate<0.05'],
  },
};

export function setup() { return bootstrapAuth(); }

export default function (ctxs: ReturnType<typeof bootstrapAuth>) {
  const ctx = pickUser(ctxs);
  applyAuth(ctx);
  readMix(ctx);
  sleep(1);
}

export { handleSummary };
```

## 11. APPENDIX B — QUICK-START COMMAND SEQUENCE (for the human/agent)

```bash
# Strategy A (simplest): legacy-bypass SUT + smoke
cd loadtest && npm install && npm run typecheck
docker compose -f docker-compose.loadtest.yml up -d --wait        # AUTH_MODE=legacy, limits lifted
k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=legacy tests/smoke-read-mix.ts
k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=legacy tests/load-read-mix.ts

# Strategy B (realistic): seed users, session auth
K6_ALLOW_SEED=true K6_USER_COUNT=25 npm run seed
k6 run -e K6_BASE_URL=http://localhost:3000 -e K6_AUTH_MODE=session -e K6_USER_COUNT=25 tests/load-market-read.ts

# Guarded chat load (cheap model only!)
K6_ENABLE_CHAT=true k6 run -e K6_AUTH_MODE=session -e K6_USER_COUNT=25 tests/load-chat.ts
```

*End of plan.*
