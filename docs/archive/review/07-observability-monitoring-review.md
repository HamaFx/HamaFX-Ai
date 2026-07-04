# 07 — Observability & Monitoring Review (Implementation Handoff)

> **Type:** Read-only audit → implementation-ready handoff prompt for another agent.
> **Repo audited:** `HamaFx/HamaFX-Ai` @ `main` (public mirror), monorepo `apps/web` + `apps/worker` + `packages/*`.
> **Audit date:** 2026-07-01. **Auditor:** automated review agent (no code was modified, run, or executed).
> **Sibling docs:** `docs/15-debugging-and-tracing.md`, `docs/08-deployment.md`, `infra/cron-vm/RECOVERY.md`.
>
> Every finding below cites `file:line`-level evidence from the tree that was cloned and read. Where a
> premise from an earlier review is contradicted by the current code, the ground truth is stated explicitly
> rather than repeated. **Nothing here is fabricated; unverifiable items are marked `[UNVERIFIED]`.**

This document follows the same **7-part structure** as prior review handoffs:

1. Mission & Operating Constraints
2. Ground-Truth Snapshot (what exists today)
3. Findings (evidence-backed, by investigation area)
4. External Research — 2026 Best Practices (cited)
5. Implementation Plan (phased; schema / query / code / config)
6. Acceptance Criteria & Verification
7. Risks, Assumptions & Out-of-Scope

---

## 1. Mission & Operating Constraints

**You are implementing the observability hardening required before HamaFX-Ai takes paying customers.** The app
began life single-user ("personal mode") and is mid-migration to multi-user (the code calls this **Phase A**).
Observability was built for a *solo operator watching their own dashboard*; it must now survive **paying users
who will not tell you when something breaks — they will churn.**

Hard constraints:

- **Do not regress the worker.** The worker (`apps/worker`) is the best-instrumented component; treat it as the
  reference implementation, not a refactor target.
- **Keep Sentry server-only by intent**, but fix the *accidental* client half-configuration (§3.1, OBS-06).
- **Shared Sentry DSN** across `apps/web` and `apps/worker` is confirmed and intentional
  (`SENTRY_DSN` env in both) — keep it, but add per-service tagging (the worker already does this;
  the web app does not).
- Solo founder = **one on-call human.** Every new alert must be actionable and low-noise, or it will be muted.
- Budget: prefer free/low-cost tooling. Do not introduce Datadog-class spend.

---

## 2. Ground-Truth Snapshot (what exists today)

### 2.1 Sentry
| Item | State | Evidence |
|---|---|---|
| Server init (Node) | ✅ configured | `apps/web/src/sentry.server.config.ts` |
| Edge init | ✅ configured (identical to server) | `apps/web/src/sentry.edge.config.ts` |
| `register()` + `onRequestError` | ✅ wired | `apps/web/src/instrumentation.ts` |
| Client init + Session Replay | ⚠️ present but **dead** (see OBS-06) | `apps/web/src/instrumentation-client.ts` |
| `global-error.tsx` capture | ⚠️ calls `captureException` but client SDK never enables | `apps/web/src/app/global-error.tsx` |
| Worker Sentry | ✅ robust: lazy init, service tags, `commit_sha`, unhandled-rejection/uncaught handlers, flush-on-exit | `apps/worker/src/sentry.ts`, `apps/worker/src/index.ts:main()`, `apps/worker/src/runner/cli.ts` |
| `packages/ai` Sentry | ❌ never imports Sentry — relies on the *caller* to capture | grep: no `@sentry/*` import in `packages/ai/src/*` |

### 2.2 Logging (three divergent conventions — see §3.2)
- **`packages/shared/src/logger.ts`** — `pino`, redaction configured, exported from the barrel… **but zero importers** (dead code).
- **`apps/worker/src/log.ts`** — bespoke JSON logger, shape `{ts, level, msg, ...meta}`, journald-aware, **no redaction**. Actually used across the worker.
- **`apps/web` + `packages/ai`** — raw `console.error/warn/info` with `[tag] freeform string` (39 web files, plus `packages/ai/src/agent.ts`, `packages/ai/src/alerts/delivery.ts`, …). No JSON, no structured meta.

### 2.3 Healthchecks.io
- Dependency-free, fail-open client `apps/worker/src/healthchecks.ts` (`ping`, `withHeartbeat`).
- Worker SignalR heartbeat every 30 s, fails if no tick in 60 s (`apps/worker/src/index.ts`).
- One HC UUID **per systemd timer/job** (15 checks) — see the table in `infra/cron-vm/RECOVERY.md`.
- Web `GET /api/health` (db/env/pgvector/cron) and `GET /api/health/db` (connectivity + migration count).

### 2.4 Cost telemetry (`chat_telemetry`)
- Table `packages/db/src/schema/telemetry.ts`; sibling `chat_tool_telemetry` (`tool-telemetry.ts`).
- Read path: `packages/ai/src/usage.ts` (`computeUsage`, `listTelemetry`) → `apps/web/src/app/(app)/settings/usage/page.tsx`.
- Budget + spend alerting: `packages/ai/src/cost.ts` (`checkBudgetAlertsAndThresholds`, 50/80/100 % + per-provider thresholds, delivered via `sendDirectNotification`).

### 2.5 Incident response
- `infra/cron-vm/RECOVERY.md` — 5 DR scenarios + healthchecks "ground truth" table.
- `infra/cron-vm/README.md` — VM/topology + schedule.
- **No** customer-facing incident material (status page, comms templates, severity taxonomy, user notification path).

---

## 3. Findings

Severity: **P0** = customer-visible outage goes unnoticed / data or money at risk · **P1** = real gap, will bite with paying users · **P2** = hygiene/consistency.

### 3.1 Sentry coverage — are failures actually reaching Sentry?

**OBS-01 (P0) — The main hot path `/api/chat` swallows errors without capturing them.**
`apps/web/src/app/api/chat/route.ts` `POST` wraps the whole agent call in `try/catch` and returns
`errorResponse(err)` (or a `BudgetExceededError` envelope). It never calls `Sentry.captureException`.
Because the error is *caught and not re-thrown*, Next.js `onRequestError` (`instrumentation.ts`) **never fires**
for it. Result: **every chat failure — the most expensive, most important request in the app — is invisible to Sentry.**
The AI SDK path even prepares diagnostics for exactly this: `packages/ai/src/agent.ts:124-133`
(`withDiagnostics(...).catch(err => { attach redacted trace; throw })`) attaches a redacted trace to the thrown
error **specifically so upstream Sentry can use it** — but the upstream chat route discards it.

**OBS-02 (P0) — The multi-agent SSE branch is 100 % silent.**
Same file, the `analysisMode !== 'single'` branch builds a `ReadableStream`; its inner
`catch (err)` enqueues an SSE `{type:'error'}` frame to the browser and closes the stream. **No capture, no re-throw.**
Multi-agent orchestration failures never reach Sentry *or* the server logs meaningfully.

**OBS-03 (P0) — The shared error helper never captures.**
`apps/web/src/lib/api.ts` → `errorResponse()` maps `AppError`/`ProviderError`/`ZodError` to HTTP envelopes and, for the
unknown case, only `console.error('[api] unhandled error', …)`. `withAuth()` (same file) catches *all* handler throws and
routes them through `errorResponse`. **Consequently ~every authenticated `/api/*` route reports unhandled errors to console only, never to Sentry.** This is the single highest-leverage fix: instrument `errorResponse`/`withAuth` once and dozens of routes gain coverage.

**OBS-04 (P1) — Vercel cron fallback routes don't capture whole-job failures.**
`apps/web/src/lib/cron.ts` → `withCronAuth()` catch = `console.error('[cron] handler error', …)` + 500, no Sentry.
`runCronJob()` likewise. So `/api/cron/{alerts,calendar,cleanup-uploads,embedding-backfill,evaluate-signals,warm-cache}`
have **no Sentry path** when the job throws. Only 6 routes capture *per-item* failures explicitly
(`briefings`, `cot`, `fred-actuals`, `news`, `snapshots`, `weekly-review`). Note `/api/cron/alerts` returns
`result.errors.length` but **never captures those per-alert errors** (`apps/web/src/app/api/cron/alerts/route.ts`).
Mitigating context: these Vercel routes are *manual-fallback*; the scheduled path runs on the GCE worker under
healthchecks.io + worker-Sentry (`infra/cron-vm/README.md`). Still inconsistent and a coverage hole during a worker outage.

**OBS-05 (P1) — Auth server actions don't capture unexpected failures.**
`apps/web/src/app/(auth)/actions.ts` `loginAction`/`registerAction` catch and return `{error: string}`. Expected
`AuthError` cases are handled, but an *unexpected* failure (e.g. DB down mid-login) is folded into a generic string
with **no Sentry**. A login outage would present as "invalid email or password" to users and produce zero Sentry signal.
Per 2026 Sentry guidance these are Server Actions that also need `withServerActionInstrumentation` (§4).

**OBS-06 (P1) — Client Sentry is half-wired and effectively disabled.**
`apps/web/src/instrumentation-client.ts` sets `dsn: NEXT_PUBLIC_SENTRY_DSN ?? SENTRY_DSN` **but**
`enabled: !!process.env.SENTRY_DSN`. In the browser bundle only `NEXT_PUBLIC_*` vars are inlined, so
`process.env.SENTRY_DSN` is `undefined` → `enabled:false` → **Session Replay and all client capture never initialize**,
and `global-error.tsx`'s `captureException` is a no-op in the browser. The "server-only" description is therefore
*accidentally* true. **Decide and make it deliberate:** either (a) delete the client config to be truly server-only,
or (b) fix `enabled` to `!!(process.env.NEXT_PUBLIC_SENTRY_DSN)` and ship real client + replay coverage. `.env.example`
already advertises `NEXT_PUBLIC_SENTRY_DSN` (line 227), implying (b) was intended.

**OBS-07 (P2) — Server/edge Sentry config is minimal.** `sentry.server.config.ts`/`sentry.edge.config.ts` set only
`dsn/tracesSampleRate/environment/enabled`. Missing: `release`/`dist` (there's a `DEPLOYED_SHA` the worker already
tags with), `Sentry.setUser()` after auth for user-scoped errors, and a `beforeSend` scrub. The web app does **not**
tag `service:web` the way the worker tags `service:worker`, so a shared-DSN project can't cleanly split the two.

**OBS-08 (P2) — Worker hot-path persistence errors are logs-only.** In `apps/worker/src/index.ts`,
`flushClosedCandle` and `flushLiveTicks` failures are `log.error(...)` only (by design, "shouldn't take down the
consumer") — but a *sustained* DB write failure produces no Sentry event, only journald noise. Add a rate-limited
capture so persistent write failures page someone.

**Coverage scorecard (server error → Sentry):**
`✅ worker jobs (cli.ts) · ✅ worker crash handlers · ✅ telegram webhook · ✅ 6 cron routes (per-item) · ✅ settings/actions.ts (most) · ❌ /api/chat · ❌ multi-agent SSE · ❌ generic withAuth routes · ❌ withCronAuth whole-job · ❌ auth actions · ❌ client/replay (dead)`.

### 3.2 Logging consistency — is `{level, msg, ...meta}` uniform?

**OBS-09 (P1) — Three incompatible logging conventions coexist; the "standard" is a vibecoded illusion.**
- The **canonical** structured logger `packages/shared/src/logger.ts` (pino, with `redact` paths for
  `authorization/cookie/password/email/token/keys/aiApiKeys`) **has no importers** — verified by grepping every
  `apps/*` and `packages/*` consumer. It is exported from `packages/shared/src/index.ts` and never used. Pino's
  default shape is also `{level:<number>, time:<epoch ms>, …, msg}` — i.e. **not** the `{level, msg, ...meta}` the
  premise assumes.
- The **worker** uses its own logger `apps/worker/src/log.ts` emitting `{ts, level:<string>, msg, ...meta}`
  (note `ts` not `time`, string level not numeric). Internally consistent, journald-aware — but **has no redaction**,
  unlike the pino one.
- **`apps/web` and `packages/ai`** don't use either structured logger. They call `console.error/warn/info` with
  `[tag] freeform string` (e.g. `apps/web/src/app/api/telegram/webhook/route.ts:79`,
  `packages/ai/src/agent.ts:662`, `packages/ai/src/alerts/delivery.ts:109`). Field order, key names, and even the
  *presence* of JSON vary by file/author.

Net: there is **no uniform JSON log shape**. Three teams-of-one wrote three conventions; the redaction that exists in
the unused logger protects nothing. For a public product this is both an ops problem (can't grep/aggregate) and a
**PII/secret-leak risk** (unredacted `console.error(err)` on the web side can serialize tokens/emails into Vercel logs).

### 3.3 Alerting gaps — what would go unnoticed until a user complains?

**OBS-10 (P0) — There is no billing system, therefore no billing-failure alerting.** Grep for
`stripe|paddle|lemonsqueezy|billing`(payments) across `apps` + `packages` returns **only** BYOK/AI-provider and
data-failover matches — **no payment processor, no billing webhook exists yet.** The premise "a billing webhook
failure would go unnoticed" is worse than assumed: the capability isn't built. **Before charging customers, a
payment integration *and* its webhook alerting must be added together** (dead-letter + Sentry + page on webhook 5xx /
signature-verify failure). Track as a hard gate.

**OBS-11 (P1) — AI-Gateway spend spikes only alert the *user who owns the budget*, not the operator, and only against
user-configured thresholds.** `packages/ai/src/cost.ts` implements genuine per-user spend alerting
(`checkBudgetAlertsAndThresholds`: 50/80/100 % of `monthlyBudgetLimit` + per-provider thresholds, deduped via
`spendAlertsState`, delivered by email/Telegram). But: (a) it fires only if the *user* set a limit; (b) it notifies the
*user*, not you the operator; (c) the daily hard-stop `MAX_DAILY_USD` is a **single global env** applied per user
(`enforceDailyBudget`/`tryReserveBudget` in `cost.ts`, sourced from `.env.example:260`), so you cannot set
per-user caps and cannot detect *operator-level* anomalies (one abusive account, gateway price spike, runaway loop).
See OBS-14 for the abuse-prevention build-out.

**OBS-12 (P1) — Silent auth failures have no alarm; the fast-path trusts a header.**
`getUserFromRequest` (`apps/web/src/lib/api.ts`) trusts `x-user-id` if present (fast path). This is **mitigated** —
`apps/web/src/middleware.ts` explicitly `headers.delete('x-user-id')` for unauthenticated requests and only sets it
from the verified JWT — so it is *not* a live spoofing bypass **for routes the middleware matches**. However the
`matcher` excludes `api/auth`, `api/cron`, `api/dev`, `api/telegram`, `debug`. Those rely on their own secrets, so
the risk is contained, but **there is no alerting on auth anomalies at all** (spike in 401s, repeated
`ACCOUNT_LOCKED`, `2FA` failures, or a sudden change in login success rate). A credential-stuffing wave or a broken
auth deploy would surface only as user complaints. Add auth-event metrics + a threshold alert.

**OBS-13 (P2) — `/api/health` computes checks it then ignores.** `apps/web/src/app/api/health/route.ts` computes
`pgvectorCheck` and `cronCheck.stuckRuns` but sets `allOk = dbCheck.ok && envCheck.ok`. A **missing pgvector
extension or a stuck cron returns HTTP 200 "ok"**, so any uptime monitor pointed at `/api/health` will report green
during a real degradation. Either include them in `allOk` or expose a separate degraded state.

### 3.4 Cost visibility — confirm global aggregation & specify per-tenant + anomaly changes

**OBS-14 (P1) — CORRECTION: `chat_telemetry` does NOT aggregate globally today; it is already per-user (Phase A).**
The earlier architecture review's "aggregates globally per-user" premise is **contradicted by the current schema and
read path** — do not implement against the stale assumption:
- `packages/db/src/schema/telemetry.ts`: `userId text('user_id').references(users.id).notNull()` plus composite index
  `telemetry_user_created_idx (user_id, created_at)` (PERF-03).
- Every read scopes by user: `computeUsage`, `listTelemetry` (`packages/ai/src/usage.ts`), `dailySpendUsd`,
  `getMonthlySpend`, `getProviderMonthlySpend` (`packages/ai/src/cost.ts`), and `usage/page.tsx` all filter
  `eq(chatTelemetry.userId, session.user.id)`.
- The running budget counter `daily_ai_spend` has composite PK `(user_id, day)` (`cost.ts` upserts).

So **per-user cost dashboards already exist.** What is genuinely missing splits into two asks:

**(a) Per-*tenant* (organization/team) dashboards.** There is **no `orgId`/`tenantId` dimension anywhere** — "tenant"
currently equals "user". If the product will have teams/orgs, this needs a real tenancy column, not a query change:

```sql
-- Migration: add tenant dimension (nullable first, backfill, then NOT NULL)
ALTER TABLE chat_telemetry      ADD COLUMN org_id text REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE chat_tool_telemetry ADD COLUMN org_id text REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE daily_ai_spend      ADD COLUMN org_id text;               -- widen PK to (org_id, user_id, day)
CREATE INDEX telemetry_org_created_idx ON chat_telemetry (org_id, created_at);
-- Read path: add computeUsageForOrg(orgId) mirroring computeUsage but GROUP BY user_id within the org,
-- and an org-scoped variant of getMonthlySpend/getProviderMonthlySpend.
```
If tenant is intended to remain = user, say so and skip (a) — but the current code cannot answer "spend for
Acme Corp across its 5 seats" without this column.

**(b) Alerting on anomalous *per-user* spend (abuse prevention once public).** Current alerting is user-configured
thresholds; abuse prevention needs **operator-owned, baseline-relative** detection that does not depend on the user
setting a limit. `chat_telemetry(user_id, created_at, est_cost_usd)` and the `daily_ai_spend(user_id, day,
total_usd_cents)` rollup already provide everything needed — no new capture is required, only a detector + operator
alert channel:

```sql
-- Per-user daily spend + a 14-day trailing baseline (reads existing daily_ai_spend)
WITH baseline AS (
  SELECT user_id,
         avg(total_usd_cents)   AS mean_cents,
         stddev_pop(total_usd_cents) AS sd_cents
  FROM daily_ai_spend
  WHERE day >= to_char(now() - interval '15 days','YYYY-MM-DD')
    AND day <  to_char(now(),'YYYY-MM-DD')
  GROUP BY user_id
),
today AS (
  SELECT user_id, total_usd_cents
  FROM daily_ai_spend
  WHERE day = to_char(now(),'YYYY-MM-DD')
)
SELECT t.user_id, t.total_usd_cents, b.mean_cents, b.sd_cents
FROM today t JOIN baseline b USING (user_id)
WHERE t.total_usd_cents > GREATEST(b.mean_cents + 3*COALESCE(b.sd_cents,0), 500);  -- z>3 or >$5/day floor
```
Wire this into a new operator-only cron/worker job → capture to Sentry + page (see §4/§5). Add an **operator hard
ceiling** independent of the user's `monthlyBudgetLimit` so a single account cannot run up unbounded gateway spend
before the monthly check trips. Also consider a per-minute/`toolCalls` velocity check off `chat_tool_telemetry`.

**OBS-15 (P2) — Stale single-user assumptions linger in fallback paths.** `apps/web/src/app/api/cron/briefings/route.ts`
still loops `const activeUsers = ['__system__']` ("Temporary … until NextAuth is implemented") even though Phase A
multi-user is live. Any per-user cost/telemetry emitted by these fallback routes is attributed to `__system__`.

### 3.5 Incident-response readiness — beyond `RECOVERY.md`

**OBS-16 (P1) — DR runbook is solid for *infra*; there is nothing for *customer-facing outages*.**
`infra/cron-vm/RECOVERY.md` is genuinely good (5 scenarios: DB restore, journal restore, worker won't start, fresh
VM, key rotation + a healthchecks ground-truth table). But it is written for "you, alone, fixing your VM." For paying
users it is missing:
- **Status page** — no public status surface exists (see §4 for options). Users have no self-serve "is it down?".
- **Incident comms templates** — no customer notification copy, no comms owner, no channel.
- **Severity taxonomy & SLOs** — no SEV1/2/3 definitions, no target response/restore times, no error-budget notion.
- **On-call / paging** — healthchecks.io emails/pings, but there is no *paging* (phone/push) escalation for a P0 at 3am;
  a single missed email = a multi-hour silent outage.
- **Customer-outage playbook** — no "chat is down for all users" / "auth is down" / "AI gateway is down" runbooks
  (RECOVERY covers infra restore, not user-facing symptom triage).
- **Post-incident** — no postmortem template.

---

## 4. External Research — 2026 Best Practices (cited)

### 4.1 Sentry for Next.js 15 monorepos + shared worker
- **Three runtimes, three configs** (`instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`);
  edge config can be trimmed if middleware only routes. tracesSampleRate ≈ 1.0 dev / 0.1–0.2 prod. Call
  `Sentry.setUser()` after auth. — *Sentry, "Next.js Observability Gaps & How to Close Them," 2026-03-24,
  https://blog.sentry.io/next-js-observability-gaps-how-to-close-them/*
- **The rule that indicts OBS-01/02/03/05:** "If you catch and don't re-throw, you **must** call `captureException`
  before returning." `error.tsx`/`global-error.tsx` boundaries and try/catch-with-graceful-return are **not**
  auto-captured; only re-thrown/uncaught errors are. — *Sentry, "Capturing Errors | Next.js,"
  https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/*
- **Server Actions are not auto-instrumented** — wrap with `Sentry.withServerActionInstrumentation(name, {headers,
  formData, recordResponse}, fn)` for spans + client/server trace continuity, and still `captureException` in caught
  branches. Applies to `settings/actions.ts`, `(auth)/actions.ts`, `onboarding/actions.ts`. — *Sentry, "Set Up
  Tracing | Next.js," https://docs.sentry.io/platforms/javascript/guides/nextjs/tracing/ ; "Manual Setup,"
  https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/*
- `onRequestError = Sentry.captureRequestError` (already in `instrumentation.ts`) covers Server Components,
  middleware, and **uncaught** route errors only — it cannot see the swallowed chat error. Requires
  `@sentry/nextjs >= 8.28` + Next 15. — *Sentry manual-setup docs (above).*
- For a **shared worker process**, tag events per service and flush before exit — which the worker already does
  (`initSentry(env,'worker')`, `service`/`commit_sha` tags, `flushSentry`). Mirror this in the web app
  (`service:web`, `release=DEPLOYED_SHA`).

### 4.2 Structured logging for small SaaS teams
- **Pino is the 2026 default** high-throughput JSON logger; emit NDJSON in prod and **never run `pino-pretty` in
  production** (throughput hit) — gate pretty behind `NODE_ENV` (the shared logger already does this correctly). —
  *HireNodeJS, "Node.js Pino Logging in 2026," 2026-05-29, https://www.hirenodejs.com/blog/nodejs-pino-logging-production-2026*
- **Standardize a field schema** — `requestId`, `userId`, `operation`, `status`, `duration` — and use **child loggers
  bound per request** for correlation IDs; redact PII/secrets **at serialization time**. — *Cadence, "How to set up
  structured logging in Node.js," 2026-05-14, https://cadence.withremote.ai/blog/structured-logging-nodejs ;
  DEV/Axiom, "Node.js Structured Logging in Production," 2026-03-30,
  https://dev.to/axiom_agent/nodejs-structured-logging-in-production-pino-correlation-ids-and-log-aggregation-262m*
- **One logger, one shape** across services; align keys with the OpenTelemetry log data model for trace correlation.
  — *Jsonic, "JSON Structured Logging," 2025-12-22, https://jsonic.io/guides/json-logging ; techinsights, "Structured
  Logging in Node.js: A Complete Guide to Pino," 2026-05-20, https://techinsights.manisuec.com/nodejs/structured-logging-node-pino/*
  → **Directly actionable:** adopt the existing `packages/shared/src/logger.ts` (pino) as the *single* standard,
  give the worker a pino child (or keep its logger but align keys to `{level, time/ts, msg, requestId, userId,
  service, ...}`), and replace `console.*` in `apps/web`/`packages/ai` with a request-scoped child logger that
  already carries the `X-Request-Id` the middleware stamps.

### 4.3 Lightweight status page + paging for a solo founder (beyond healthchecks.io)
- **Instatus** — generous free tier (≈15 monitors / 200 subscribers), hosted status page + monitoring; best pure,
  low-friction pick for a solo founder. — *StatusRay, "8 Best Status Page Tools for Small Teams in 2026," 2026-02-19,
  https://statusray.com/blog/best-status-page-tools-for-small-teams*
- **Better Stack** — combines uptime monitoring, **status page, and on-call scheduling/paging (phone/push)** plus log
  management; the strongest single upgrade for "one human must be paged for a P0," at the cost of per-responder
  pricing. — *StackFYI, "Status Page Tools 2026: Statuspage vs Better Stack vs Instatus," 2026-05-04,
  https://www.stackfyi.com/guides/status-page-tools-2026-statuspage-vs-better-stack-vs-instatus ; Augment Code,
  "8 Best Status Page Tools for Engineering Teams (2026)," 2026-05-18, https://www.augmentcode.com/tools/best-status-page-tools*
- **Upptime** — free/OSS (GitHub Actions + hosted page) if you prefer to self-host YAML. **OpenStatus** — open-source
  hosted status/monitoring alternative. — *OpenStatus, "The State of Hosted Status Pages in 2026,"
  https://www.openstatus.dev/guides/best-hosted-status-page-2026*
- **Paging specifically:** healthchecks.io can already fan-out to integrations, but for guaranteed escalation add a
  pager: Better Stack on-call, or route Sentry + healthchecks alerts into a paging tool. Keep healthchecks.io for
  cron/heartbeat liveness; add a status page (Instatus) + a real pager (Better Stack) for customer-facing signal.

**Recommended solo-founder stack:** keep **healthchecks.io** (cron/worker liveness) + **Sentry** (errors) → add
**Better Stack** (uptime probe on `/api/health`, on-call paging, one public **status page**), or **Instatus** if you
only need a status page and will page via Sentry/Better Stack alert rules.

---

## 5. Implementation Plan (phased)

### Phase 1 — Stop the bleeding (Sentry blind spots) — P0
1. **Instrument the shared error path once (OBS-03).** In `apps/web/src/lib/api.ts`, add
   `Sentry.captureException(err, {tags:{route}, extra:{requestId}})` in `errorResponse` for the non-`AppError`
   (unexpected) branch and in the `withAuth` catch. This lights up dozens of routes at once. Do not double-report
   handled `AppError`/`ZodError` (those are expected 4xx).
2. **Capture in `/api/chat` and the multi-agent SSE branch (OBS-01/02).** Add `Sentry.captureException` before
   `errorResponse(err)` and inside the `ReadableStream` `catch` before enqueuing the SSE error frame; tag
   `component:'chat'`, `mode`, `threadId`, `userId`. Use the diagnostics already attached at
   `packages/ai/src/agent.ts:124-133`.
3. **Capture whole-job failures in `withCronAuth`/`runCronJob` (OBS-04)** and capture `evaluateAlerts().errors[]` in
   `/api/cron/alerts`.
4. **Decide client Sentry (OBS-06):** fix `enabled` to key off `NEXT_PUBLIC_SENTRY_DSN` (enable replay) **or** delete
   `instrumentation-client.ts` + the `global-error.tsx` capture to be honestly server-only.
5. **Worker persistence capture (OBS-08):** rate-limited `captureException` for sustained `flushLiveTicks`/
   `flushClosedCandle` failures.

### Phase 2 — Logging unification — P1
6. Adopt `packages/shared/src/logger.ts` (pino) as the **single** standard. Replace `console.*` in `apps/web` and
   `packages/ai` with a request-scoped `createScopedLogger({requestId, userId})` (requestId already available via
   `X-Request-Id`). Align the worker logger keys (or swap to a pino child) to a shared `{level, time, msg, service,
   requestId, userId, ...meta}` schema. Extend `redact` paths to cover worker meta (which currently has none).
7. Add a lint rule / CI grep to fail new `console.error(` in `apps/web` & `packages/ai` (prevent regression).

### Phase 3 — Alerting for paying customers — P0/P1
8. **Billing gate (OBS-10):** when the payment integration is added, ship its webhook with dead-letter + Sentry
   capture + paging on signature-verify / 5xx failures **in the same PR**. Do not enable paid plans without it.
9. **Operator-side spend anomaly detection (OBS-11/14b):** new worker job (own healthchecks UUID) running the
   z-score/velocity query in §3.4(b); capture to Sentry + page the operator; add an operator hard-ceiling env
   independent of user `monthlyBudgetLimit`.
10. **Auth anomaly alerting (OBS-12):** emit metrics for 401 rate, `ACCOUNT_LOCKED`, 2FA failures, login success
    rate; threshold alert to the operator.
11. **Fix `/api/health` (OBS-13):** include pgvector + stuck-cron in `allOk` (or a `degraded` state) and point the
    new uptime monitor at it.

### Phase 4 — Per-tenant cost (only if tenancy = org) — P1
12. If teams/orgs are on the roadmap, run the `org_id` migration in §3.4(a) (nullable → backfill → NOT NULL) and add
    `computeUsageForOrg`. Otherwise document that tenant = user and close.
13. Fix stale `__system__` loop in `/api/cron/briefings` (OBS-15).

### Phase 5 — Incident response for outages — P1
14. Stand up a **status page** (Instatus or Better Stack) + uptime probe on `/api/health`.
15. Add **paging** (Better Stack on-call) fed by Sentry + healthchecks.
16. Author customer-facing runbooks under `infra/` or `docs/`: SEV taxonomy + SLOs, comms templates, symptom-triage
    playbooks (chat down / auth down / AI-gateway down), and a postmortem template. Extend, don't replace,
    `RECOVERY.md`.

---

## 6. Acceptance Criteria & Verification

- **A1:** A forced throw inside `runChat` produces a Sentry event tagged `component:chat` (verify in Sentry), not just
  a 500 to the client. Same for the multi-agent SSE branch.
- **A2:** A forced throw in an arbitrary `withAuth` route (e.g. `/api/journal`) yields a Sentry event via
  `errorResponse` — no per-route edits needed.
- **A3:** `grep -rn "console\.\(error\|warn\|info\)" apps/web/src packages/ai/src` returns ~0 (allow-listed
  exceptions only); a request log line is valid NDJSON with `{level, time, msg, requestId, userId, service}` and
  redacts a token/email injected into meta.
- **A4:** Client Sentry decision shipped: either replay events appear for a browser error, **or** the client config
  and dead `global-error` capture are removed (no half state).
- **A5:** Synthetic per-user spend spike (seed `daily_ai_spend`) triggers the operator anomaly alert; user
  `monthlyBudgetLimit` alerts still fire independently.
- **A6:** `/api/health` returns 503 when pgvector is absent or a cron is stuck (currently returns 200).
- **A7:** Public status page reachable; a simulated `/api/health` failure flips it and pages the on-call within the
  probe interval.
- **A8:** `docs/`/`infra/` contains SEV taxonomy, comms templates, ≥3 customer-outage runbooks, and a postmortem
  template.
- **A9 (billing gate):** paid plans cannot be enabled until the billing-webhook failure alert is demonstrated firing
  on a simulated bad webhook.

## 7. Risks, Assumptions & Out-of-Scope

- **Assumption:** "tenant" currently = "user"; per-org tenancy (Phase 4) is only needed if teams ship. Confirm with
  product before the `org_id` migration.
- **Assumption:** the shared Sentry DSN and "server-only" posture are intentional; the plan keeps both and only fixes
  the accidental client half-config.
- **Risk (noise):** turning on `errorResponse`-level capture may surface a burst of previously-hidden errors — expect
  an initial triage spike; use `ignoreErrors`/sampling as the worker does. Do not let this cause alert fatigue for the
  solo on-call.
- **Risk (PII):** until Phase 2 redaction lands, avoid adding raw `console.error(err)` in the web app — some errors
  serialize emails/tokens into Vercel logs today.
- **`[UNVERIFIED]`:** healthchecks.io check *configuration* (grace periods, alert channels) lives in the
  healthchecks.io account, not the repo, and was not inspected. Vercel project alert settings and the actual Sentry
  project alert rules likewise live outside the repo and are unverified here.
- **Out-of-scope:** the deep security posture of the `x-user-id` fast-path (flagged for a security review, mitigated by
  middleware today); Langfuse LLM-tracing tuning (present and functioning: `packages/ai/src/instrumentation.ts`,
  worker `initLangfuse`); and the frontend loading/error-state review (covered in the UI/UX handoff).
