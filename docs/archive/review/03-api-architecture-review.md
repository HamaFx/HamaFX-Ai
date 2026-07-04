# 03 — API & Backend Architecture Review (Handoff Prompt)

Date: 2026-07-01
Scope audited (read-only): `apps/web/src/app/api/**` (72 route files), `apps/web/src/middleware.ts`,
`apps/web/src/lib/api.ts`, `apps/web/src/lib/cron.ts`, `packages/db/src/rate-limit.ts`,
`packages/shared/src/errors.ts`, `packages/ai/src/alerts/*`, `vercel.json`, `apps/web/vercel.json`,
`docs/01-architecture.md`, `docs/05-api-routes.md`, `docs/08-deployment.md`, `docs/10-security.md`.

> **You are the implementing agent.** This document is your work order. Read Part 1 for context,
> Parts 2–3 for what is wrong and why, and execute Parts 4–5 in order. Do not start coding before
> reading the two premise corrections in Part 1 — two assumptions in the original audit brief are
> factually wrong against the current code, and building on them would waste your time.

---

## Part 1 — Context

HamaFX-Ai runs two co-operating deployments: Vercel hosts `apps/web` (UI + chat + read APIs +
light cron "pokers"), and a single GCE VM (`hamafx-cron`) runs the always-on SignalR consumer and
the heavy scheduled jobs. The `/api/cron/*` routes on Vercel are thin endpoints poked by systemd
timers on the VM (and, for one job, by a Vercel cron). Heavy work (embedding backfill ramp, weekly
review, snapshots pruning) already lives on the VM specifically to dodge Vercel's 60 s function
ceiling (`docs/01-architecture.md`).

The shared request plumbing is solid and worth preserving:
- `apps/web/src/lib/api.ts` centralises `withAuth()`, `getUserFromRequest()`, `parseJsonBody()`
  (streamed 6 MiB body cap), `parseSearchParams()`, and `errorResponse()`.
- `apps/web/src/middleware.ts` (Edge) mints/enforces a `hfx_csrf` double-submit cookie on
  state-changing `/api/*`, injects `x-user-id`, and stamps `x-request-id`.
- `apps/web/src/lib/cron.ts` `withCronAuth()` gates `/api/cron/*` with a constant-time bearer
  compare against `CRON_SECRET` (or an admin session cookie).
- `packages/db/src/rate-limit.ts` `withRateLimit()` is a Postgres-backed per-key limiter.

**Two premise corrections — read before doing anything:**

1. **`docs/08-backend-and-api.md` does not exist.** The backend reference is `docs/05-api-routes.md`.
   Several code comments still point at the non-existent path (`apps/web/src/lib/api.ts` header,
   `packages/shared/src/errors.ts:19`). Treat those as stale references, not as a missing doc.

2. **The README does NOT claim "no per-user rate limiting," and that claim would be false.**
   Per-user rate limiting is implemented and live. `withRateLimit(userId, group, limit)` guards the
   AI-spend and mutation endpoints: `ai_chat` (30/min, `apps/web/src/app/api/chat/route.ts:52`),
   `ai_alert_preview` (`api/alerts/preview/route.ts:128`), `ai_export`
   (`api/chat/threads/[id]/export/route.ts:50`), `ai_bulk_delete`
   (`api/chat/threads/bulk-delete/route.ts:51`), `alerts_create` 60
   (`api/alerts/route.ts:55`), `push_subscribe` 10 (`api/push/subscribe/route.ts:47`), `upload` 20
   (`api/upload/route.ts:60`), `bulk_test` 2 (`api/settings/bulk-test/route.ts:47`), plus per-IP
   `login`/`register`/`forgot_password` in `apps/web/src/app/(auth)/actions.ts` and ~20 per-user
   settings actions in `apps/web/src/app/(app)/settings/actions.ts`. So the correct question is
   **not** "is there any rate limiting" (there is) but "is the *design* of that rate limiting safe
   for a mixed free/paid public product" — see Finding F4.

The findings below are what the audit actually surfaced. Severity = likelihood × blast radius given
the current single-/few-user deployment, annotated with what changes if signups open.

---

## Part 2 — Findings (severity, file references, evidence)

### F1 — Telegram webhook trusts an unvalidated body and is auth-optional when unconfigured — **MEDIUM**
File: `apps/web/src/app/api/telegram/webhook/route.ts`
- `POST` does `update = await req.json()` and passes it straight to `handleTelegramWebhook(update, env)`
  with **no zod schema**. It is the only input-accepting route that skips schema validation entirely
  (every other POST/PUT/PATCH uses `parseJsonBody` or a `safeParse`).
- The secret-token gate is conditional: `if (env.TELEGRAM_SECRET_TOKEN && secretToken !== …)`. When
  `TELEGRAM_SECRET_TOKEN` is unset the check is **skipped**, so the endpoint accepts arbitrary
  unauthenticated payloads. The route is also excluded from the middleware matcher, so there is no
  second gate behind it.
- The comparison is `!==` (not constant-time). Minor next to the two issues above.

**Query-param validation (sub-finding, LOW):** validation of `URLSearchParams` is inconsistent.
`market/candles` and `market/price` use `parseSearchParams` + zod, but 10 routes read raw params via
`searchParams.get(...)` with hand-rolled coercion (`api/alerts/route.ts`, `api/news/route.ts`,
`api/decision-signals/route.ts`, `api/journal/route.ts`, `api/portfolio/positions/route.ts`,
`api/sentiment/route.ts`, `api/chat/threads/route.ts`, `api/chat/threads/[id]/route.ts`,
`api/auth/verify-email/route.ts`). These are simple flags (`active=1`, `fields=thread`), so the
security risk is low, but the inconsistency is real.

### F2 — Internal error messages leak to clients on the fallback path — **MEDIUM**
Files: `packages/shared/src/errors.ts` (`formatErrorResponse`, ~line 71), `apps/web/src/lib/api.ts`
(`errorResponse`), `apps/web/src/lib/cron.ts` (`withCronAuth`, `runCronJob`),
`apps/web/src/app/api/chat/route.ts` (multi-agent SSE branch).
- `AppError` instances are mapped cleanly to `{ code, message, details?, requestId? }`. But the
  **fallback** for any non-`AppError` returns `message: error instanceof Error ? error.message : …`
  with status 500. So any unexpected throw (DB driver error, provider client error, `runChat`
  internals) has its raw `.message` returned to the caller. Stack traces are not leaked; message
  text is.
- `withCronAuth` and `runCronJob` do the same: `{ error: { code: 'INTERNAL', message } }` /
  `{ error: err.message }`. Blast radius here is small (cron callers are `CRON_SECRET`-authenticated),
  but it is the same anti-pattern.
- The chat multi-agent SSE branch enqueues `{ type: 'error', error: errMsg }` where
  `errMsg = err.message` — a raw provider/agent error string streamed to the browser.

### F3 — Error-shape and rate-limit-header inconsistency across routes — **LOW–MEDIUM**
The standard envelope is `{ error: { code, message, requestId? } }` (docs/05 §2.1). These routes
diverge with ad-hoc shapes and omit `requestId`:
- `api/push/subscribe/route.ts` → `{ error: 'invalid_body', issues }`, `{ missing: [...] }`,
  `{ error: 'Too many requests' }`.
- `api/push/unsubscribe/route.ts` → `{ error: 'invalid_body', issues }`.
- `api/admin/test-alert-email/route.ts`, `api/admin/test-telegram/route.ts` →
  `{ error: 'invalid_body' }`, `{ missing: [...] }`, `{ error: 'resend HTTP …' }` (502).
- `api/telegram/webhook/route.ts` → plain-text `'Unauthorized'` / `'Bad Request'`.

Rate-limit responses are also inconsistent: `/api/chat` returns 429 **with** `Retry-After` and
`X-RateLimit-Limit`/`-Remaining` headers (good), but `push_subscribe`'s 429 (and every other
`withRateLimit` caller) returns a bare body with **no** rate-limit headers.

### F4 — Rate-limiting design gaps for a mixed free/paid product — **MEDIUM** (today) / **HIGH** (if signups open)
File: `packages/db/src/rate-limit.ts`.
Per-user limiting exists (see Part 1 correction #2), but the design has three gaps that matter the
moment untrusted users can sign up:
1. **Fixed 1-minute window, not sliding.** The counter is keyed on
   `date_trunc('minute', now())` with `INSERT … ON CONFLICT DO UPDATE`. This is the classic
   fixed-window boundary problem: a user can send `limit` requests at `:59.7` and another `limit` at
   `:00.1`, i.e. **up to 2× the intended rate** in ~1 s. For `ai_chat` that is 60 turns in a couple
   of seconds.
2. **No global / tenant-wide ceiling.** Limits are strictly per-user. The only shared guard is the
   global daily budget `MAX_DAILY_USD` (default $5; `docs/10-security.md` §"AI Cost Guardrails";
   enforced in `runChat` → `BudgetExceededError` → 503 in `api/chat/route.ts`). Because that budget
   is **global**, the real public-signup exposure is not unbounded spend — it is a **shared-budget
   denial of service**: a handful of free users burning turns can trip the $5 ceiling and return 503
   to *every* user, including paying ones, until UTC midnight. There is no per-tier or per-user
   spend partition.
3. **Read endpoints are unlimited and sit in front of finite provider quotas.** `/api/market/*`,
   `/api/news`, `/api/calendar`, `/api/sentiment`, `/api/decision-signals` have no `withRateLimit`.
   They are served from the `packages/data` cache, but a burst of cache-miss requests (novel
   symbol/timeframe/count combos, e.g. `count` up to 5000 on candles) fans out to upstream
   providers whose free tiers are small (BiQuote ~10 req/min per `docs/05` §12.3). One user can
   exhaust provider quota for everyone.

Positive: the limiter is **fail-closed for the user** — a DB error inside `withRateLimit` throws and
the route returns 500 rather than silently allowing the call. Keep that property in any refactor.

### F5 — `cron/alerts` can double-send notifications under concurrent invocation — **MEDIUM**
Files: `apps/web/src/app/api/cron/alerts/route.ts`, `packages/ai/src/alerts/evaluator.ts`,
`packages/ai/src/alerts/persistence.ts` (`markFired`), `packages/ai/src/alerts/delivery.ts`.
- The route comment claims idempotency "because we only consider rows with firedAt IS NULL." That
  holds for **sequential** reruns only. The flow is: (a) `getActiveUnfiredAlerts` selects
  `WHERE active = true AND firedAt IS NULL`; (b) the delivery layer **sends** email/Telegram; (c)
  `markFired(id)` runs `UPDATE alerts SET firedAt, active=false WHERE id = <id>` — keyed on **id
  only**, with no `AND firedAt IS NULL` guard and no row lock (`FOR UPDATE SKIP LOCKED`).
- The claim-to-mark window spans a network send (hundreds of ms to seconds). If two invocations
  overlap — a systemd timer retry after a slow response, `hamafx-light-alerts.timer` firing while a
  prior run is still delivering, or an operator hand-triggering from the admin UI during a scheduled
  run — both read the same unfired rows and both deliver. **Result: duplicate alert emails/Telegram
  messages.** This is a read-then-write race, exactly the anti-pattern the idempotency literature
  warns against (Part 6).
- For contrast, the other write crons are genuinely idempotent: `cron/snapshots` upserts on
  `(symbol, daily, asOf)`; `cron/briefings` and `cron/weekly-review` guard on a `briefings_emitted`
  PK; `cron/cleanup-uploads` is naturally idempotent (deleting an absent object is a no-op).
  `cron/evaluate-signals` is fired only by the Vercel cron (no VM timer, confirmed against
  `infra/cron-vm/units/`), so it has no cross-scheduler double-fire — but it also has no atomic
  claim, so a Vercel retry could double-run it.

### F6 — Conflicting `vercel.json` files; `maxDuration` overrides likely not applied; `/api/chat` is the timeout risk — **HIGH**
Files: `vercel.json` (repo root), `apps/web/vercel.json`, `docs/08-deployment.md`.
- There are **two** `vercel.json` files with disjoint, conflicting content:
  - Root `vercel.json` is the authoritative one for a repo-root project (it defines `framework`,
    `buildCommand`, `outputDirectory: apps/web/.next`). It contains a **`crons`** block
    (`/api/cron/evaluate-signals`, `0 1 * * *`) and **no `functions` map**.
  - `apps/web/vercel.json` contains the **`functions` `maxDuration`** map (`chat`=60, cron
    routes 15–60) and **no crons**.
- Vercel reads a single `vercel.json` at the project Root Directory. Given the root file's
  `outputDirectory`/`buildCommand`, the Root Directory is the repo root, which means
  **`apps/web/vercel.json` is almost certainly ignored** and the `maxDuration` overrides never take
  effect. If so, `/api/chat` and the cron functions fall back to the **plan default** duration
  (Vercel Hobby ~10 s, Pro ~15 s), not 60 s.
- `/api/chat` is the single route most exposed to the ceiling regardless: in multi-agent modes
  (`analysisMode` `standard`/`full`) it runs 2–4 agents **sequentially** plus tool loops and streams
  SSE the whole time (`apps/web/src/app/api/chat/route.ts`). A `full` run (technical + fundamental +
  risk + sentiment) can easily exceed 15 s and plausibly 60 s. If the `functions` map is not applied,
  streaming chats get killed mid-response.
- Documentation drift compounds this: `docs/08-deployment.md` shows a **third** `vercel.json`
  variant (with `installCommand`/`ignoreCommand`, a `functions` map, and no crons) and states
  "We do **not** ship a `crons` block in `vercel.json`" — directly contradicted by the root file,
  which *does* ship one.

### F7 — Route handlers (L1) call external providers directly, bypassing the data/adapter layer (L3) — **LOW–MEDIUM**
`docs/01-architecture.md` states the strict rule: a layer may import only from layers below it, and
handlers must reach providers via `packages/data` / adapter code, never hit L4 external APIs directly.
Violations:
- `apps/web/src/app/api/admin/test-alert-email/route.ts` → raw `fetch('https://api.resend.com/emails')`
  even though `packages/ai/src/alerts/delivery.ts` already owns Resend delivery.
- `apps/web/src/app/api/admin/test-telegram/route.ts` → raw `fetch('https://api.telegram.org/bot…')`
  even though `packages/ai` exports `telegramApiCall`.
- `apps/web/src/app/api/cron/cleanup-uploads/route.ts` → raw `fetch` to the Supabase Storage REST API
  (list + delete); there is no `packages/data` storage adapter and `apps/web/src/lib/storage.ts` is
  not used here.
Blast radius is small (admin- and cron-only utilities), but each duplicates provider knowledge
(endpoints, auth headers, error handling) outside L3 and drifts from the adapters. For contrast, the
market/news/calendar read routes correctly go through `packages/data` (no direct `fetch`).

### F8 — Runtime documentation drift: docs say Edge, code is all Node — **LOW**
`docs/08-deployment.md` states the default runtime is **Edge** for cheap reads
(`/api/market/*`, `/api/news`, `/api/calendar`, `/api/alerts`, `/api/journal`) and Node only for
chat/cron. In reality **all 71 declaring route files set `export const runtime = 'nodejs'`** (the 3
without a declaration are NextAuth's catch-all, `verify-email`, and `dev/login`). No API route runs
on Edge. The "cheap reads on Edge" performance/cost assumption in the docs is false; every read
incurs a Node serverless invocation.

---

## Part 3 — Root cause

- **F1/F3:** the shared helpers (`withAuth`, `parseJsonBody`, `errorResponse`) are excellent but
  **opt-in**. Routes written before the helpers existed, or written as "quick" admin/webhook
  utilities, hand-roll their own parsing and error shapes. There is no lint rule or wrapper that
  *forces* every handler through the canonical path, so drift accumulates at the edges.
- **F2:** the error envelope was designed for `AppError` and treats "everything else" as a single
  500 that echoes `.message` for debuggability. That trades confidentiality for convenience on the
  exact path (unexpected errors) where messages are least controlled.
- **F4:** the limiter was built for a single-tenant/trusted-user product (fixed window, per-user
  only, global budget). Those choices are correct for today and wrong for open signups. The design
  never had to reason about one user degrading another.
- **F5:** "idempotent" was reasoned about for sequential cron reruns (the common case) and the
  concurrent-overlap case was not modelled. `markFired` keys on `id` because the caller already
  "knows" the row is unfired — a read-then-write assumption that breaks under concurrency.
- **F6:** monorepo Vercel config split across two files, with the deployment doc describing a third
  hypothetical file. No single source of truth for platform config; nobody verified which file
  Vercel actually loads.
- **F7:** admin/cron utilities were added as thin one-offs and reached for `fetch` directly instead
  of the (existing) adapters, because nothing blocks an L1 file from importing `fetch`.
- **F8:** the runtime strategy changed (everything moved to Node once handlers started importing
  `getDb()`, which can't run on Edge) but the deployment doc was not updated.

---

## Part 4 — Recommended fix (design)

1. **Force every handler through the canonical envelope.** Route all `/api/*` responses (success and
   error) through `errorResponse`/a shared `jsonOk` helper. Fix the leak at the source in
   `formatErrorResponse`: for non-`AppError`, return a generic `"Internal error"` message + the
   `requestId`, and log the real error server-side (Sentry + console). Never put `error.message` in
   a client body unless it came from an `AppError` deliberately constructed for the client. Apply the
   same to `withCronAuth`, `runCronJob`, and the chat SSE `error` event.
2. **Validate the Telegram webhook and make its auth mandatory.** Add a zod schema for the Telegram
   `Update` shape and `parse` it; treat a missing `TELEGRAM_SECRET_TOKEN` as a **hard 500/refuse**
   in production (fail-closed) rather than skipping the check; use a constant-time comparison.
3. **Harden the rate-limit design for multi-tenant use** without ripping out the working Postgres
   limiter:
   - Move to a **sliding-window** algorithm to kill the 2× boundary burst (either a two-bucket
     weighted approximation in SQL, or adopt Upstash `@upstash/ratelimit` sliding-window if a Redis
     dependency is acceptable — see Part 6 for the trade-off).
   - Add a **global (tenant-wide) limiter** on AI-spend groups in addition to the per-user one, and
     make `MAX_DAILY_USD` **per-user** (or per-tier) instead of a single shared counter, so one user
     cannot 503 everyone.
   - Add modest per-user (or per-IP for anonymous) limits to the unauthenticated-adjacent **read**
     endpoints that fan out to provider quotas.
   - Standardise 429s: always emit `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
     `X-RateLimit-Reset`.
4. **Make `cron/alerts` atomically claim rows before sending.** Replace the read-then-send-then-mark
   sequence with an atomic claim: either `UPDATE … SET firedAt = now() WHERE id = ANY(...) AND
   firedAt IS NULL RETURNING id` (only rows you actually claimed proceed to delivery), or
   `SELECT … FOR UPDATE SKIP LOCKED` inside a transaction. Prefer claim-before-send with a
   `delivered_at` follow-up so a delivery failure can be retried without re-sending to already-served
   channels (outbox/status-machine pattern, Part 6). Add a lightweight run-lock (advisory lock or a
   `cron_runs` row) so overlapping invocations of the same job no-op.
5. **Collapse Vercel config to one authoritative file and verify it loads.** Keep a single
   `vercel.json` at the Root Directory Vercel actually uses; merge the `functions` `maxDuration` map
   and the `crons` block into it; delete the dead one. Confirm via a deploy that `/api/chat` reports
   the intended `maxDuration`. Set `/api/chat`'s `maxDuration` explicitly (and consider a route-level
   `export const maxDuration` as a belt-and-braces fallback that does not depend on `vercel.json`
   path resolution). Reconcile `docs/08-deployment.md` with reality.
6. **Route the admin/cron provider calls through adapters (L3).** Replace the raw `fetch` calls in
   `admin/test-alert-email`, `admin/test-telegram`, and `cron/cleanup-uploads` with the existing
   `packages/ai` delivery helpers / a new `packages/data` storage adapter.
7. **Fix the runtime doc drift** (F8) and the stale `docs/08-backend-and-api.md` references
   (Part 1 #1).

---

## Part 5 — Step-by-step implementation plan (execute in order)

Work in this order; each step is independently shippable. Do not run or deploy code as part of this
task unless explicitly asked — implement and rely on the existing test suite.

1. **Stop the error leak (F2).**
   1. Edit `packages/shared/src/errors.ts` `formatErrorResponse`: in the non-`AppError` branch,
      set `message` to a constant (`'Internal error'`), keep `code: 'INTERNAL'` and `requestId`, and
      do **not** include `error.message`. Add a server-side `console.error`/Sentry capture with the
      real error and the `requestId`.
   2. Edit `apps/web/src/lib/cron.ts`: in `withCronAuth` and `runCronJob` catch blocks, return a
      generic message and log the real error (keep the `requestId`/job name in the log, not the body).
   3. Edit `apps/web/src/app/api/chat/route.ts` multi-agent SSE `catch`: emit a generic
      `{ type: 'error', error: 'Internal error', requestId }` and log the real `err`.
   4. Update the stale `docs/08-backend-and-api.md` comment references to `docs/05-api-routes.md` in
      `apps/web/src/lib/api.ts` and `packages/shared/src/errors.ts`.

2. **Validate + lock down the Telegram webhook (F1).**
   1. Add a `TelegramUpdateSchema` (zod) in `packages/shared` (or co-located) covering the fields
      `handleTelegramWebhook` reads; `parse` the body in `apps/web/src/app/api/telegram/webhook/route.ts`
      and return the standard 400 envelope on failure.
   2. Make the secret mandatory: if `process.env.NODE_ENV === 'production'` and
      `TELEGRAM_SECRET_TOKEN` is unset, refuse (500) instead of skipping; compare tokens with a
      constant-time helper (reuse the `timingSafeEqual` in `lib/cron.ts` or Node `crypto`).
   3. Return the standard error envelope instead of plain text.

3. **Standardise error shapes and 429 headers (F3).**
   1. Convert `push/subscribe`, `push/unsubscribe`, `admin/test-alert-email`, `admin/test-telegram`
      to the `{ error: { code, message, requestId } }` envelope (throw `validationError`/`AppError`
      and let `withAuth`→`errorResponse` render them).
   2. Add a shared `rateLimitedResponse(rl, req)` helper that sets `Retry-After`,
      `X-RateLimit-Limit/-Remaining/-Reset`, and use it at **every** `withRateLimit` call site
      (currently only `/api/chat` sets headers).

4. **Fix `cron/alerts` idempotency (F5).**
   1. In `packages/ai/src/alerts/`, add an atomic claim: `UPDATE alerts SET firedAt = now() WHERE
      id = ANY($claimed) AND firedAt IS NULL RETURNING id`, and only deliver for returned ids.
      Alternatively adopt a `pending → claimed → delivered` status column with `delivered_at` so a
      delivery failure retries without re-sending.
   2. Change `markFired` in `packages/ai/src/alerts/persistence.ts` to include
      `AND firedAt IS NULL` in its `WHERE` (defensive, even after the claim change).
   3. Add a per-job run-lock (Postgres advisory lock `pg_try_advisory_lock`, or a `cron_runs` row
      with a unique `(job, window)` key) in `withCronAuth` callers so overlapping invocations no-op.
   4. Apply the same advisory-lock guard to `cron/evaluate-signals` (single Vercel cron, but retries
      can double-run).

5. **Consolidate Vercel config and pin the chat timeout (F6).**
   1. Determine the Vercel project's Root Directory. Merge the `functions` `maxDuration` map and the
      `crons` block into the single `vercel.json` at that directory; delete the other file.
   2. Add `export const maxDuration = 60;` to `apps/web/src/app/api/chat/route.ts` as a
      config-path-independent fallback (and to any cron route that needs >15 s if it can still be
      invoked on Vercel).
   3. Update `docs/08-deployment.md`: remove the "we do not ship a crons block" line (a crons block
      *is* shipped), and show the real, single config.

6. **Harden the rate-limit design (F4).**
   1. Replace the fixed-window SQL in `packages/db/src/rate-limit.ts` with a sliding-window
      approximation (two adjacent minute buckets, weighted by elapsed fraction) — or introduce
      `@upstash/ratelimit` sliding-window if adding Redis is approved (Part 6 trade-off + Open
      Questions).
   2. Add a **global** AI-spend limiter and convert `MAX_DAILY_USD` to per-user/per-tier so one user
      cannot 503 everyone.
   3. Add per-user (authenticated) / per-IP (anonymous) limits to the provider-quota-facing read
      routes: `market/*`, `news`, `calendar`, `sentiment`, `decision-signals`.
   4. Keep the fail-closed-for-the-user property; add tests for the boundary-burst case.

7. **Route admin/cron provider calls through adapters (F7).**
   1. Replace raw `fetch` in `admin/test-alert-email` and `admin/test-telegram` with the
      `packages/ai` Resend delivery helper and `telegramApiCall`.
   2. Add a `packages/data` Supabase Storage adapter (list/delete by prefix) and call it from
      `cron/cleanup-uploads`.

8. **Fix runtime doc drift (F8).** Update `docs/08-deployment.md` to state that all API routes run
   on the Node runtime (Edge is used only by `middleware.ts`), and remove the Edge-reads claim.

---

## Part 6 — Acceptance criteria

- [ ] No route returns a raw `error.message` (or provider/DB error text) for an unexpected error;
      client bodies for 500s carry a generic message + `requestId`, and the real error is in
      Sentry/logs. Verified for `errorResponse`, `withCronAuth`, `runCronJob`, and the chat SSE
      error event.
- [ ] `POST /api/telegram/webhook` rejects malformed bodies with the standard 400 envelope and, in
      production, refuses when `TELEGRAM_SECRET_TOKEN` is unset; token compare is constant-time.
- [ ] Every input-accepting route validates its body/query with a zod schema (no bare `req.json()`
      passed to business logic); query params validated consistently.
- [ ] All `/api/*` error responses use `{ error: { code, message, requestId? } }`; the ad-hoc shapes
      in the push/admin/telegram routes are gone.
- [ ] Every 429 sets `Retry-After` and `X-RateLimit-*` headers.
- [ ] `cron/alerts` cannot double-send under concurrent invocation: delivery only proceeds for rows
      the run atomically claimed; a second overlapping run of the same job no-ops. A concurrency test
      (two simultaneous invocations) shows each alert delivered exactly once.
- [ ] Exactly one `vercel.json` exists; a preview deploy confirms `/api/chat` runs at the intended
      `maxDuration`; `docs/08-deployment.md` matches the shipped config.
- [ ] Rate limiting: boundary-burst test shows a user cannot exceed ~1× the limit across a window
      boundary; a global AI-spend ceiling and per-user/tier daily budget exist so one user cannot
      503 others; provider-quota read routes are limited.
- [ ] `admin/test-*` and `cron/cleanup-uploads` contain no direct external-provider `fetch`; they go
      through `packages/ai` / `packages/data`.
- [ ] `docs/08-deployment.md` correctly states all API routes are Node runtime; stale
      `docs/08-backend-and-api.md` references updated to `docs/05-api-routes.md`.
- [ ] Existing test suites pass; new tests cover the webhook validation, the alerts concurrency
      claim, the error-leak fallback, and the rate-limit boundary case.

---

## Part 7 — Open questions (need human/product decision)

1. **Redis or stay Postgres-only for rate limiting?** Upstash `@upstash/ratelimit` gives a
   battle-tested sliding-window/token-bucket out of the box (~2 Redis commands/request), but adds a
   new external dependency and cost, and the product deliberately runs Postgres-only today. Should we
   (a) implement sliding-window in SQL to avoid new infra, or (b) adopt Upstash for the AI-spend
   endpoints only? See sources below.
2. **Sliding window vs token bucket for the AI endpoints?** Token bucket tolerates deliberate bursts
   (nice UX for a chat "send 3 quick follow-ups" pattern) while capping sustained rate; sliding
   window enforces a smoother ceiling. Which matches the intended product feel for chat vs alerts?
3. **Per-user vs per-tier budgets.** What are the actual free/paid tiers, and what daily $ ceiling
   per tier? Needed to size the global limiter and to decide whether free users share a pooled budget
   or each get their own.
4. **Which `vercel.json` does the Vercel project actually load?** This depends on the project's Root
   Directory setting, which is not visible in the repo. Confirm before deleting either file.
5. **Are the `/api/cron/*` light pokers ever invoked concurrently in practice?** Confirm the systemd
   timer definitions (`OnUnitActiveSec` vs job duration) and whether admin hand-triggers can overlap
   scheduled runs — this sets the priority of the F5 run-lock work.
6. **Idempotency keys for the Telegram webhook.** Telegram provides `update_id`; should we dedupe on
   it (store processed `update_id`s) so retried deliveries don't double-process, per the webhook
   idempotency guidance below?

### Research sources (2026 best practices)

- Next.js App Router route-handler security & zod validation:
  - Next.js API Routes Best Practices (2026) — https://pristren.com/blog/nextjs-api-routes-best-practices/
  - Next.js Security Best Practices (2026) — https://www.securecodereviews.com/blog/nextjs-security-complete-guide-2026
  - Zod validation in Next.js API routes — https://heyytechy.com/zod-validation-nextjs-api-routes/
- Rate limiting on Vercel with Upstash Redis (sliding window vs token bucket vs fixed window):
  - Upstash ratelimit algorithms (official) — https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms
  - Rate limiting Next.js API routes with Upstash — https://upstash.com/blog/nextjs-ratelimiting
  - Rate limiting in Next.js with Upstash Redis (2026) — https://stacknotice.com/blog/nextjs-rate-limiting-upstash-2026
- Idempotency keys for webhook/cron endpoints (atomic claim, outbox, dedupe window):
  - Idempotency Keys for Webhooks: A Practical Guide (Hookbase) — https://www.hookbase.app/blog/idempotency-keys-for-webhooks
  - Exactly-Once Webhook Processing (EventDock) — https://eventdock.app/blog/exactly-once-webhook-processing-pattern
  - Webhook Idempotency and Deduplication (Hooklistener) — https://www.hooklistener.com/learn/webhook-idempotency-and-deduplication

> Key external guidance applied above: validate every input with zod `safeParse` and return
> `{ error: { code, message } }` consistently (Next.js best-practices sources); prefer sliding-window
> for smooth ceilings and token-bucket for burst-tolerant throughput, always emitting
> `X-RateLimit-*` headers (Upstash docs); and for cron/webhook idempotency use a **single atomic
> check-and-claim** (`INSERT … ON CONFLICT DO NOTHING RETURNING` / `UPDATE … WHERE … IS NULL
> RETURNING` / `SELECT … FOR UPDATE SKIP LOCKED`) rather than read-then-write, which races on
> concurrent retries (Hookbase/EventDock/Hooklistener).
