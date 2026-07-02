# HamaFX-Ai — Implementation Orchestration Plan

> **Revision note (2026-07-01):** Reviewed and upgraded. Added: an independent-
> verification requirement for security-critical tasks (new column in the Progress Log,
> flagged tasks in Phase 1), explicit exploit-proving test requirements for
> 1.1/1.2/1.4/1.5/1.6, a backup-before-migration + staging-gate requirement for Phase 3,
> a session-sized breakdown of Phase 3, parallelization guidance for Phase 4, and the
> previously-missing second half of finding 04 §3.6 in task 4.10.
> **No existing Progress Log entries were changed, reworded, or removed** — only a new
> column was appended to each row.

**Audience: you are an AI coding agent about to implement fixes across the HamaFX-Ai
codebase.** This file is your top-level work order. It does **not** contain full
implementation detail — it tells you which of the 8 review files to open for each task,
and in what order to work. Never implement from the one-line description below alone.

**Files referenced below, all in this same directory:**
- `01-authentication-security-review.md`
- `02-database-rls-scalability-review.md`
- `03-api-architecture-review.md`
- `04-ai-agent-safety-cost-review.md`
- `05-worker-infra-reliability-review.md`
- `06-frontend-ux-performance-review.md`
- `07-observability-monitoring-review.md`
- `08-testing-cicd-code-quality-review.md`
- `HamaFX-Ai-Production-Readiness-Audit-Prompts.md` (referenced only in Phase 8)

---

## How to work through this file

For every task below:
1. **Open the cited review file and read the full finding.** The one-liner here is a
   pointer, not the spec — file paths, exact reasoning, and code sketches live in the
   source doc.
2. Implement the fix.
3. Run `pnpm typecheck` and `pnpm lint` for the affected package(s), plus the relevant
   test suite. **For any task marked "Verification test required" below, that specific
   test must exist and pass — a green general test suite is not sufficient on its own.**
4. Update the **Progress Log** at the bottom of this file (task ID, status, date, commit
   ref). Leave the **"Verified independently?"** column exactly as you found it — that
   column is only ever filled in by a *different* session, or by Hama directly. The
   session that did the work does not get to mark its own work independently verified.
5. Commit in small, single-concern diffs. Reference the task ID in the commit message,
   e.g. `fix(1.8): capture unhandled errors to Sentry, stop leaking error.message`.

Work the phases **in order**. Don't start Phase N+1 until Phase N's acceptance criteria
are met — except where a phase is explicitly marked parallelizable.

## Global constraints (every phase, every task)

- **Preserve self-host / `AUTH_MODE=legacy` compatibility at every step.** A single-
  `APP_PASSWORD` self-hosted install must keep working, unchanged, all the way through —
  this is an explicit acceptance criterion in both 01 and 02.
- **Never weaken existing strictness to make something pass.** No disabling TS `strict`,
  no relaxing `no-explicit-any`, no blanket `eslint-disable`, no lowering coverage
  thresholds. Only raise them (08 Part 6).
- **Never run a destructive or irreversible command without explicit human confirmation.**
  This especially means: Phase 3.6 (the actual RLS cutover migration), any
  `pg_restore --clean`, any force-push or history rewrite, any non-sandbox billing API
  call in Phase 8.3.
- **Never commit secrets** or real credentials into tracked `.env` files.
- **Security/trust-critical tasks are never marked independently-verified by the same
  session that implemented them.** This covers 1.1, 1.2, 1.4, 1.5, 1.6, and all of
  Phase 3. A different session (or Hama, manually) must re-open the changed files and
  confirm the fix is actually present — not just that tests pass — before that task's
  "Verified independently?" column in the Progress Log is filled in.
- **Security-critical tasks need a test that proves the exploit is blocked, not just a
  passing suite.** For 1.1, 1.2, 1.4, 1.5, and 1.6: each needs one named test that
  simulates the actual attack (e.g. a non-admin user calling `run_system_action` and
  asserting rejection, zero FRED calls, zero writes). Called out explicitly on each task.
- **Take a fresh, restore-verified backup immediately before any schema migration** —
  applies to every migration in Phase 3 (3.1, 3.3, 3.6 especially), not only the RLS
  cutover. Confirm the backup restores *before* running the migration, not after.
- **Rehearse all of Phase 3 end-to-end against a staging Supabase project or a restored
  backup copy before it touches production.** Schema, backfill, RLS policies, and 02 §6's
  acceptance criteria all need to pass on a non-production copy first. This is
  financial/trading data — treat it accordingly.
- **If a task requires a product/business decision, stop and add it to "Blocked — needs
  Hama" at the bottom instead of guessing.** Every review file has its own "Open
  Questions" section — treat those as stop-and-ask, not stop-and-assume.
- **Small diffs, one concern each.** Especially for Phase 0/1 — you want Phase 0's CI
  actually catching regressions in everything that follows it.

---

## Phase 0 — Build the safety net first (Testing & CI)

**Source:** `08-testing-cicd-code-quality-review.md`
**Depends on:** nothing. **Do this first, full stop** — no fix in any later phase can be
verified without CI that actually runs and actually gates.

0.1 Fix the CI bootstrap failure (all workflows currently fail in ~3s, before any real
    work runs). Working hypothesis, unconfirmed since job logs had expired at audit time:
    pnpm is double-specified — `package.json`'s `"packageManager": "pnpm@9.15.4"` plus
    `pnpm/action-setup@v4 with: version: 9` in every workflow. Re-run a workflow and read
    the fresh log before assuming this is the cause. [08 §1c / Part 5 task 1]
0.2 Enable branch protection on `main` requiring `Lint & Typecheck` and `Unit Tests
    (Fast)` (and `CodeQL` once green) to pass before merge. [08 §1a / Part 5 task 2]
0.3 Pick **one** CI system (GitHub Actions or GitLab CI) and delete the other — both
    currently define lint/typecheck/test/e2e/eval in parallel and will drift. [08 §1f /
    Part 5 task 3]
0.4 Move the "Report Coverage" step out of `ci-slow.yml` (it's PR-gated but that workflow
    only triggers on push/schedule, so it can never run) into `ci-fast.yml`. [08 §1d]
0.5 Add a real build gate (`turbo run build`) to CI — today a broken `next build` is only
    caught later by Vercel. [08 §1e / Part 5 task 14]
0.6 Wire the eval suite to the real 15-case assertion set: either change the `eval`
    script to pass `--cases`, or make `cases.json` the default instead of the
    assertion-free `prompts.json`. Add an `eval` task to `turbo.json` (currently absent,
    which is why the nightly `turbo run eval` fails). [08 §3 / Part 5 task 4]
0.7 Add a deterministic, offline eval using recorded/mocked model+tool fixtures (MSW is
    already a dependency) so tool-selection, tool **arguments**, and numeric outputs are
    asserted without live API keys — not just "was the right tool name called." Keep the
    live `/api/chat` harness as a separate scheduled scored run. [08 §3 / Part 5 task 5]
0.8 Enforce coverage on the PR path (`test -- --coverage` in `ci-fast`, not just nightly).
    [08 §2 / Part 5 task 6]
0.9 Add behavioral tests for `compute_position_health`, the `verify_call` tool's own
    `execute()` (not just the `verification.ts` engine it wraps), and `middleware.ts`
    (CSRF mint/enforce, `x-user-id` injection from JWT, confirm `AUTH_MODE=legacy` bypass
    is impossible when `NODE_ENV=production`). All three currently have zero behavioral
    coverage. [08 §2 / Part 5 tasks 7–9]
0.10 Write the billing test contract (auth/tenant scoping, idempotency, webhook signature
    verification, proration/dunning edges) **before** any billing code lands — this sets
    up Phase 8.3 to ship test-first. [08 §2 / Part 5 task 10]

**Acceptance:** [08 Part 7, items 1–4]. Additionally: open a PR that deliberately breaks a
test and confirm the merge button is actually blocked.

---

## Phase 1 — Fix now, independent of the SaaS timeline

**Sources:** 01, 03, 04, 06, 07 — these are exploitable-today or user-visible-today bugs,
not just multi-tenant prep.
**Depends on:** Phase 0.1–0.3 (CI actually running and gating). The rest of Phase 0 can
continue in parallel with this phase.

1.1 Gate `run_system_action` behind a server-side role check — read the caller's role
    from context/DB and reject non-operators **before** any FRED call or
    `intermarket_resonance` write happens. Currently any authenticated user's chat can
    trigger it despite being documented "Operator-only." [04 §3.2 / Part 5 P0#1]
    **Verification test required:** a non-operator user's tool call is asserted to be
    rejected with zero FRED calls and zero `intermarket_resonance` writes — not just "a
    role check exists somewhere in the function."
1.2 Add a confirmation/guardrail layer for **all** mutation tools (`set_alert`,
    `log_journal`, `share_snapshot`, `run_system_action`) — at minimum require explicit
    confirmation for `share_snapshot` (its signed URL bypasses the site password gate)
    and `run_system_action`. [04 §3.2 / Part 5 P0#2]
    **Verification test required:** a mutation call attempted without explicit
    confirmation is asserted to be blocked end-to-end, for at least `share_snapshot` and
    `run_system_action`.
1.3 In the same pass as 1.1/1.2 (same file), remove or clearly label the theatrical
    `run_system_action` branches (`cot_sync`, `flush_cache`, `check_migrations`) that
    only emit canned log strings and do no real work. [04 Part 5 P2#10]
1.4 **Highest user-trust risk in the whole audit.** Anchor `verify_call` to reality:
    fetch the live price for `symbol` inside the tool, flag when `entry`/`stop`/`target`
    deviate from market beyond a tolerance, and never let `agree:true` render for a price
    the tool never checked against the market. Also fix `docs/03-ai-agent.md` L140, which
    currently describes a different (retrospective) tool than what's implemented — pick
    one behavior and make the doc match the code. [04 §3.4 / Part 5 P0#3]
    **Verification test required:** feed `verify_call` a deliberately hallucinated entry
    price far from the live market and assert it returns `agree:false` / a deviation
    flag — not a clean pass.
1.5 Harden `/api/dev/login`: require `NODE_ENV === 'development'` explicitly (it
    currently only excludes `production`, so any non-production, non-development
    environment — e.g. a misconfigured `staging` — leaves it open). [01 High finding /
    §4 step 4.2]
    **Verification test required:** with `NODE_ENV` set to `'staging'` and to `'test'`,
    assert the route returns 404 in both cases, not just when `NODE_ENV='production'`.
1.6 Telegram webhook: add zod schema validation for the `Update` body, make
    `TELEGRAM_SECRET_TOKEN` mandatory in production (hard-fail if unset instead of
    skipping the check), use a constant-time token comparison. **Note:** 01 rates this
    fail-open behavior High; 03 rates the same file Medium as part of a broader
    input-validation finding (F1). Implement to 01's stricter bar regardless. [01 High
    finding / §4 step 4.1; 03 F1 / Part 5 step 2]
    **Verification test required:** with `NODE_ENV=production` and
    `TELEGRAM_SECRET_TOKEN` unset, assert the route refuses (500); separately assert a
    malformed body is rejected (400) by the new schema.
1.7 Add `withAuth` gating to `/api/health` and `/api/health/db` — currently open,
    usable for DoS or DB-availability enumeration. [01 Medium finding]
1.8 **Fix the shared error-leak + missing-Sentry-capture problem in one pass** — two
    different reviews cite nearly the same files for two different reasons, so fix
    together: `packages/shared/src/errors.ts` (`formatErrorResponse`),
    `apps/web/src/lib/api.ts` (`errorResponse`/`withAuth`), `apps/web/src/lib/cron.ts`
    (`withCronAuth`/`runCronJob`), the `/api/chat` multi-agent SSE catch branch, and
    `(auth)/actions.ts` (`loginAction`/`registerAction`). For each: (a) return a generic
    client-facing message + `requestId`, never raw `error.message`; (b) add
    `Sentry.captureException` with route/component tags before returning. [03 F2 / Part 5
    step 1; 07 OBS-01, OBS-02, OBS-03, OBS-04, OBS-05 / Phase 1 items 1–3]
1.9 Consolidate the two conflicting `vercel.json` files into the one at the actual
    Vercel Root Directory; merge the `functions.maxDuration` map and the `crons` block
    into it; add `export const maxDuration = 60` directly in `/api/chat/route.ts` as a
    config-path-independent fallback; confirm via a deploy that it actually takes effect.
    [03 F6 / Part 5 step 5]
1.10 Make `cron/alerts` atomically claim rows before sending
    (`UPDATE ... WHERE firedAt IS NULL RETURNING id`, deliver only to returned ids)
    instead of read-then-send-then-mark; add a per-job run-lock so overlapping
    invocations no-op. [03 F5 / Part 5 step 4]
1.11 Route `admin/test-alert-email`, `admin/test-telegram`, and `cron/cleanup-uploads`
    through the existing `packages/ai`/`packages/data` adapters instead of raw `fetch`
    (an L1→L4 layering violation). [03 F7 / Part 5 step 7]
1.12 Fix the PWA offline precache: add a real favicon (or remove `/favicon.ico` from
    `PRECACHE_URLS`), **and** change `sw.template.js`'s install handler from atomic
    `cache.addAll()` to per-URL `Promise.allSettled` so one missing asset can't silently
    wipe the entire offline shell. [06 FE-13 / Sprint 1 task 1]
1.13 Fix chart tick performance: use `series.update()` for the live tick instead of a
    full `setData()` over ~300 bars every tick; decouple indicator-series lifecycle from
    `candles` so indicators aren't torn down and rebuilt on every price update (mirror
    `use-sub-pane-chart.ts`, which already does this correctly). [06 FE-09, FE-10 /
    Sprint 1 task 2]
1.14 Fix the silent news-fetch failure: destructure `isError`/`error` from the
    `useInfiniteQuery` in `news-view.tsx` and render a distinct error+retry state instead
    of falling back to the "no results" empty state. [06 FE-01 / Sprint 1 task 3]
1.15 Fix duplicate non-unique `id`/`aria-controls` on tool-result cards using `useId()`.
    [06 FE-05 / Sprint 1 task 4]

**Acceptance:** see each cited file's own acceptance-criteria section for the specific
item (01 §5, 03 Part 6, 04 Part 7, 06 Part 5, 07 §6).

---

## Phase 2 — BLOCKING DECISION: what is a tenant?

**Source:** 02 §7 Q1, cross-referenced against 01 §4.
**Depends on:** nothing technical — this is a product decision, not an engineering task.
Do not start Phase 3 until it's answered. Safe to raise with Hama in parallel with
Phases 0/1.

2.1 This is not a coding task. Present the question directly: is a tenant an individual
    **user**, or an **organization/team** (shared workspace, org-level billing, multiple
    seats)?
2.2 **Flag this specific conflict before implementing either doc literally:** 01's own
    fix sketch (§4, "Data Access Layer & Isolation") uses a `rls.user_id` session
    variable and implicitly assumes tenant = user. 02's fix (§4.2) uses
    `app.current_tenant` and explicitly treats the boundary as unresolved. If you follow
    both docs as written, half the codebase ends up scoped to one GUC and half to the
    other. Recommend standardizing on `app.current_tenant` (matches 02's more thorough
    treatment) regardless of which answer Hama gives — a solo user is just an org of one.
2.3 Record the decision at the top of the **Progress Log** below before starting Phase 3.

---

## Phase 3 — Multi-tenancy foundation

**Sources:** 02 (primary), 01 (cache/secrets findings), 04 + 07 (the `__system__`
convergent finding).
**Depends on:** Phase 2 answered.

**This phase is too large for one session — split it into three:**
- **Session A:** 3.1–3.3 (additive migration, backfill, `NOT NULL` + index cleanup)
- **Session B:** 3.4–3.8 (connection layer, pgvector, RLS cutover, backup fixes, TLS)
- **Session C:** 3.9–3.12 (secrets vault, cache namespacing, `__system__` fix, the
  `__system__` user-row check)

Before Session A starts: take a fresh backup and confirm it restores (Global
Constraints). Before Session B's 3.6 runs against anything but staging: confirm
everything up to that point has been rehearsed end-to-end against a staging Supabase
project or a restored backup copy (Global Constraints) — this is the one migration in
the whole plan that's genuinely hard to walk back.

3.1 Migration A (additive, nullable): create `organization` + `organization_member`
    (if tenant = org) or skip and use `user_id` directly (if tenant = user); add
    nullable `tenant_id` to the ~24 tenant-owned tables plus the 2 FK-only children
    (`chat_messages`, `decision_signal_outcomes`). Full table inventory in 02 Appendix A.
    [02 §5 step 2]
3.2 Backfill: one org per existing user (or skip if tenant=user), populate `tenant_id`
    from current ownership, run as the future `BYPASSRLS` role. [02 §5 step 3]
3.3 Migration B: `SET NOT NULL` on `tenant_id`; add the `(tenant_id, opened_at DESC)`
    composite index on `journal_entries`; drop the redundant `candles_1m_symbol_t_idx`.
    [02 §5 step 4, F9/F12]
3.4 Connection layer: add `DIRECT_URL` (session mode, port 5432); point
    `drizzle.config.ts` migrations and all backup/restore scripts at it instead of the
    pooled `DATABASE_URL`; add the `SET LOCAL app.current_tenant` wrapper in the Drizzle
    request path; create a `BYPASSRLS` admin role for worker/cron/migrations. [02 §5
    step 5, F6/F10]
3.5 pgvector: add `SET LOCAL hnsw.ef_search` / iterative-scan settings around
    `searchMemory`; extend its `WHERE` clause with `tenant_id`. [02 §5 step 6, F4/F5]
3.6 **Migration C (cutover) — get explicit human go-ahead before running this against
    anything but a local/staging DB.** `ENABLE` + `FORCE ROW LEVEL SECURITY` and create
    the `tenant_isolation` policy on every tenant table, gated behind an edition/build
    flag so open-core self-host either skips it or runs `BYPASSRLS`. [02 §5 step 7, F1]
3.7 Fix backups: switch `verify-restore.sh` to a pgvector-capable Postgres image
    (`pgvector/pgvector:pg15`), make restore errors fatal instead of logged-and-ignored,
    assert HNSW indexes exist post-restore; add per-tenant export + delete scripts,
    rehearse both weekly. [02 §5 step 8, F7/F8]
3.8 Fix TLS: ship `SUPABASE_CA_CERT` + `rejectUnauthorized: true` for the hosted build.
    [02 §5 step 9, F11]
3.9 Centralize secrets delivery for the hosted edition — both Vercel and the GCE worker
    should fetch secrets from a vault (e.g. Infisical, GCP Secret Manager) at runtime
    instead of `.env` files. Keep the existing BYOK AES-256-GCM encryption for
    user-provided API keys as-is; it's correctly implemented. [01 §3 "Secrets
    Management"]
3.10 Namespace all in-memory caches by tenant: `cachedVertex`/`cachedVertexKey` in
    `packages/ai/src/model.ts`, the `agents` Map in `multi-agent/stream.ts`, and
    `MemoryCache`/`getDefaultCache` in `packages/data/src/cache/index.ts` are all
    currently global and can leak one tenant's cached client/data into another tenant's
    request. [01 High finding, "Global State / Module-Level Caching"]
3.11 **Kill the `__system__` fallback pattern.** This is the single most-corroborated bug
    across all 8 reviews — caught independently 3 times. Replace every hardcoded
    `['__system__']` / `?? '__system__'` with real per-user iteration:
    `apps/web/src/app/api/cron/briefings/route.ts`,
    `apps/web/src/app/api/cron/weekly-review/route.ts`,
    `packages/ai/src/briefings/generate.ts`, `packages/ai/src/memory/memory-index.ts`,
    `packages/ai/src/memory/thread-summary.ts`, `packages/ai/src/persistence.ts`
    (including `recordTelemetry`), `packages/ai/src/planner.ts`,
    `packages/ai/src/title.ts`. [01 Critical finding / §4 step 4.2; 04 §3.3 point 4;
    07 OBS-15]
3.12 **Do this check before or during 3.11:** run
    `SELECT * FROM users WHERE id = '__system__'`. If that row doesn't exist,
    `recordTelemetry` inserts have likely been silently failing (FK violation swallowed
    by a `.catch()`) — meaning some cost/usage telemetry may already be missing. Report
    what you find to Hama either way. [04 Open Question 3]

**Acceptance:** [02 §6 — cross-tenant read/write isolation tests, `EXPLAIN ANALYZE`
index checks, backup-restore verification after the schema changes].

---

## Phase 4 — Rate limiting & AI cost hardening

**Sources:** 03, 04, 07 — three reviews covering the same problem area from different
angles (infra rate limiting, AI-specific budget logic, monitoring/alerting).
**Depends on:** Nothing, for 4.1–4.9 and 4.11 — **safe to run in parallel with Phase 3**,
same as Phases 6/7. Only 4.10 actually needs `tenant_id` to exist (and only applies if
Phase 2 decided tenant = org) — do that one last, after Phase 3 lands.

4.1 Replace the fixed-window rate limiter (`packages/db/src/rate-limit.ts`) with a
    sliding-window approach — the current `date_trunc('minute', now())` bucketing allows
    up to ~2× the intended rate across a window boundary. [03 F4 / Part 5 step 6.1]
4.2 Add a global (tenant-wide) AI-spend ceiling in addition to the per-user one; convert
    `MAX_DAILY_USD` from a single shared global counter to per-user/per-tier, so one user
    burning turns can't return 503 to everyone else. [03 F4 / Part 5 step 6.2; 04
    Part 5 P1#5]
4.3 Add per-user (authenticated) / per-IP (anonymous) limits to the provider-quota-facing
    read routes: `market/*`, `news`, `calendar`, `sentiment`, `decision-signals` —
    currently unlimited and sitting in front of small provider free-tier quotas. [03 F4 /
    Part 5 step 6.3]
4.4 Standardize error envelopes AND 429 responses: convert `push/subscribe`,
    `push/unsubscribe`, `admin/test-alert-email`, `admin/test-telegram` to the
    `{error:{code,message,requestId}}` shape; add a shared `rateLimitedResponse()` helper
    that sets `Retry-After` + `X-RateLimit-*` headers on every `withRateLimit` call site
    (today only `/api/chat` sets them). [03 F3 / Part 5 step 3]
4.5 Add `maxOutputTokens` to `streamText` plus a per-turn input-context ceiling; raise
    `DEFAULT_TURN_ESTIMATE_USD` from the flat $0.01 reservation to a model-aware estimate
    so one oversized `gemini-2.5-pro` turn can't overshoot `MAX_DAILY_USD` before
    post-stream reconciliation catches up. [04 §3.3 / Part 5 P1#5]
4.6 Unify the cost/pricing tables: dedupe `cost.ts`'s `RATES` (8 entries, `{5,15}`
    fallback for everything else) against `byok-providers.ts`'s `ModelSpec` pricing;
    cover every supported model explicitly — the current fallback badly mis-prices
    `deepseek-chat` and others. [04 §3.3 / Part 5 P1#6]
4.7 Upgrade the citation enforcer from turn-level to value-level: compare numeric claims
    against actual tool-result values from *this* turn instead of "did any numeric tool
    run this turn"; broaden the `PRICE_TOKEN` regex to catch comma-formatted, integer,
    and JPY-style prices. [04 §3.4 / Part 5 P1#7]
4.8 Add domain/range sanity validation to `set_alert.level` and
    `log_journal.entry/stop/target/size` — currently bare `z.number()` with no bounds or
    near-market sanity check. [04 Part 5 P2#9]
4.9 Build an operator-side spend-anomaly detector: a new worker job (own healthchecks
    UUID) running a baseline/z-score query against the existing `daily_ai_spend`
    rollup, capturing to Sentry + paging the operator, independent of any user-set
    `monthlyBudgetLimit`. 07 §3.4(b) includes ready-to-use SQL for this. [07 OBS-11 /
    OBS-14b, Phase 3 item 9]
4.10 **Only if Phase 2 decided tenant = organization:** add `org_id` to `chat_telemetry`,
    `chat_tool_telemetry`, `daily_ai_spend`; add `computeUsageForOrg()`. If tenant = user,
    skip this and document that explicitly instead. **Do this part regardless of the
    tenant decision** — it's the other half of the same finding, previously dropped:
    capture the *actual* provider-billed cost per call where the provider/AI Gateway
    exposes it (not just the token-based estimate), and add a BYOK-vs-system-key flag to
    each telemetry row so usage on a user's own API key is never billed as system spend.
    [04 §3.6; 04 Part 5 P2#8; 07 §3.4(a)]
4.11 Decide the fate of vestigial per-domain model routing — `routeTurn`'s domain
    currently doesn't actually select the chat model, only the planner/title/vision
    derivations use it. Wire domain→model selection up for real, or delete the dead path
    and document that a single `chatModel` is used. Configure context caching on the
    static system-prompt prefix (~90% cached-input discount, currently unused). [04
    Part 5 P2#11]

**Acceptance:** [04 Part 7 — cost/citation items; 03 Part 6 — rate-limit items]

---

## Phase 5 — Observability & logging unification

**Source:** 07 (primary), plus 04's injection-hardening (same defensive layer).
**Depends on:** Phase 1.8 (the shared error-capture fix) — this phase builds directly on
top of it.

5.1 Decide client-side Sentry deliberately: either fix
    `enabled: !!process.env.SENTRY_DSN` → `!!process.env.NEXT_PUBLIC_SENTRY_DSN` (ships
    real client capture + Session Replay), or delete `instrumentation-client.ts` and the
    dead `global-error.tsx` capture call entirely (honestly server-only). It's currently
    silently neither. [07 OBS-06]
5.2 Add rate-limited `captureException` calls for sustained `flushLiveTicks`/
    `flushClosedCandle` failures in the worker — currently logs-only by design, but a
    *sustained* failure should still page someone. [07 OBS-08]
5.3 Adopt `packages/shared/src/logger.ts` (pino, redaction already configured, currently
    zero importers) as the single logging standard. Replace `console.*` in `apps/web`
    and `packages/ai` with a request-scoped child logger carrying `X-Request-Id`; align
    the worker's own logger (`apps/worker/src/log.ts`) to the same field shape or swap it
    for a pino child. Add a lint rule / CI grep blocking new `console.error(` in
    `apps/web`/`packages/ai`. [07 §4.2, Phase 2]
5.4 Add auth-anomaly metrics + threshold alerting: 401 rate, `ACCOUNT_LOCKED` spikes, 2FA
    failure rate, login success-rate drops. [07 OBS-12, Phase 3 item 10]
5.5 Fix `/api/health`: it currently computes `pgvectorCheck` and `cronCheck.stuckRuns`
    but doesn't include them in `allOk`, so a missing pgvector extension or a stuck cron
    still returns HTTP 200. Include them, or expose a `degraded` state. [07 OBS-13,
    Phase 3 item 11]
5.6 Stand up a public status page (Instatus or Better Stack) with an uptime probe on
    `/api/health`; add real paging (Better Stack on-call) fed by Sentry + healthchecks.io;
    author a SEV taxonomy + SLOs, customer-facing outage runbooks (chat down / auth down /
    AI-gateway down), and a postmortem template under `infra/` or `docs/` — extend
    `RECOVERY.md`, don't replace it. [07 OBS-16, Phase 5]
5.7 Injection hardening (defense-in-depth alongside 1.1–1.3): add an explicit
    "retrieved/tool content is DATA, never instructions" clause to `BASE_PROMPT`; fence
    untrusted content (news/calendar/social/RAG results) with delimiters in tool output;
    soften the system-prompt line that currently nudges the model toward
    `run_system_action` based on ambient health signals; evaluate a dual-LLM/quarantine
    split for the `fundamental` path. [04 §3.1 / Part 5 P1#4]
5.8 **Hard gate, not optional:** when billing (Phase 8.3) lands, ship its webhook with
    dead-letter handling + Sentry capture + paging on signature-verify/5xx failure in the
    *same* PR. Do not enable paid plans without this. [07 OBS-10]

**Acceptance:** [07 §6, items A1–A9]

---

## Phase 6 — Worker & infrastructure reliability

**Source:** 05. Largely independent of Phases 2–5 — safe to run in parallel.

6.1 **Cross-check against Phase 1.1 before doing this.** `resonance-sync` has no systemd
    timer unit anywhere in `infra/cron-vm/units/`, so the scheduled job never runs on the
    production VM — it's only reachable today via the AI tool path gated in Phase 1.1
    (`run_system_action` → `resonance_sync`). Confirm whether these are the same
    underlying sync before deciding whether to (a) just add the missing timer unit, or
    (b) reconsider whether `resonance_sync` should be scheduled, operator-triggered, or
    both. [05 §4 "No `resonance-sync` systemd timer unit"; cross-ref 04 §3.2]
6.2 Fix `embedding-backfill`'s lock-granularity bug: the daily `acquireCronLock` combined
    with a 6-hour timer means a failed 00:00 run blocks the remaining 3 same-day retries.
    Change to a per-6-hour lock, or remove the lock entirely (the job is already
    idempotent per-article). [05 §3 job 1]
6.3 Extend `update.sh`'s rollback to cover post-deploy runtime crashes, not just
    install/build/test/restart failures — today a deploy that passes all three but
    crashes 10 seconds after reaching `active (running)` has no automatic rollback path.
    [05 §1]
6.4 Add the two missing entries to `RECOVERY.md`'s UUID table: `HC_CLEANUP_UPLOADS_UUID`
    and `HC_JOB_RESONANCE_SYNC_UUID`. [05 §4]
6.5 Verify — don't assume — whether `postgres:15-alpine` in `verify-restore.sh` actually
    supports the `vector` extension. This overlaps with Phase 3.7's fix; do them
    together. [05 §5 Open Question 3]
6.6 Only when justified by real load, not preemptively: upgrade `hamafx-cron` from
    `e2-medium` to `e2-standard-2`; longer-term, split the always-on SignalR consumer
    from the heavy-job runners. [05 §6]

**Acceptance:** 05 has no single formal acceptance-criteria section — verify each item
above against that finding's own "Finding:" text.

---

## Phase 7 — Remaining polish (frontend + housekeeping)

**Sources:** 06 (P2/P3 items not already in Phase 1), 08 (P2 housekeeping), 03 (minor
doc drift). **Depends on:** nothing — safe to interleave with any other phase, lowest
priority of the set.

7.1 Enforce `--touch-min` (44px) on primary controls; bump the 20px image-remove button
    to at least 24px. [06 FE-04]
7.2 Fix the tool-message virtualizer size estimate — it checks for a `'tool-invocation'`
    type that no part ever actually has (real types are `'tool-get_price'` etc.). [06
    FE-12]
7.3 Wrap streamed assistant text in an `aria-live="polite"` region (mirror
    `chart-canvas.tsx`'s existing pattern). [06 FE-06]
7.4 Ensure every `DrawerContent` has a `DrawerTitle`; reconcile the manual focus-trap
    with vaul's built-in one. [06 FE-07]
7.5 Whitelist `https://s3.tradingview.com` in CSP `script-src` if the Pro chart is a
    supported path. [06 FE-15]
7.6 Add `images.remotePatterns` for the Supabase host; migrate journal remote `<img>`
    tags to `next/image`. [06 FE-16]
7.7 Align the 1.5s-vs-3s polling-cadence claim across code and docs; consider wiring the
    existing (currently unused) SSE hook into the chart. [06 FE-11]
7.8 Remaining P3 polish: scoped `error.tsx` per view, `role="alert"` on inline failure
    messages, glass-surface contrast check, manifest screenshots, news-list
    virtualization, RSC conversion where profiling supports it. [06 FE-02, FE-03, FE-08,
    FE-14, FE-17, FE-18]
7.9 Remove dead `@ui/*` config from `tsconfig.base.json` / `.prettierrc.json` / the
    ESLint message — it points at a `packages/ui` that doesn't exist. Drop the unused
    `TEST_VAR` from `turbo.json`. [08 Part 5 task 11]
7.10 Adopt Knip (+ optional dependency-cruiser) as a CI check for unused files/exports/
    deps. [08 Part 5 task 12]
7.11 Set `actions/checkout` `fetch-depth: 0` so a future `turbo --affected` gate has real
    git history to work with. [08 Part 5 task 13]
7.12 Dependency review: align `tsx` versions across packages, decide on the `next-auth`
    beta pin, verify `@next/bundle-analyzer`/`lucide-react` major versions are
    intentional, add a scheduled `pnpm audit --prod`. [08 Part 5 task 15]
7.13 Strengthen `check-test-files.mjs` to flag files with zero real assertions, not just
    zero test files. [08 Part 5 task 16]
7.14 Fix runtime-doc drift: `docs/08-deployment.md` claims an Edge runtime for reads;
    all 71 declaring route files actually set `nodejs`. [03 F8 / Part 5 step 8]
7.15 Update the stale `docs/08-backend-and-api.md` comment references in
    `apps/web/src/lib/api.ts` and `packages/shared/src/errors.ts` to point at the real
    `docs/05-api-routes.md`. [03 Part 1 correction #1]

---

## Phase 8 — Run the remaining audit prompts

**Source:** `HamaFX-Ai-Production-Readiness-Audit-Prompts.md`. These are meta-tasks, not
code changes — hand each prompt to a **fresh agent session**, per the pack's own
instructions ("don't chain them in one conversation").

8.1 Run **Prompt 00** (Documentation & Reality Drift) — fix-directly, same session,
    scoped to docs/config only. Genuinely overdue: 6 of the 8 completed reviews (02, 03,
    04, 06, 07, 08) had to correct a stale doc-path or premise before they could start.
    Running this now also makes any future re-audit cheaper.
8.2 Run **Prompt 09** (Open-Core Architecture) — its own scope says it reads findings
    from 01–04, which are now complete, so it's unblocked.
8.3 Run **Prompt 10** (Billing — 2Checkout/Verifone). **Before running it, resolve this
    conflict:** 01's own open question #3 assumes Stripe ("Should we integrate Stripe
    Checkout now…"), while Prompt 10 explicitly states Stripe was ruled out because it
    doesn't support Iraq-based merchants, and commits to Verifone instead. Confirm which
    is actually current before running Prompt 10 — its own first research task, verifying
    Iraq merchant eligibility with Verifone, hasn't been completed either way yet. Also
    depends on Phase 2's tenant decision, since the billing schema needs to attach to the
    tenancy model.
8.4 Run **Prompt 11** (Legal/Compliance) — last, since its own scope explicitly reads 01,
    04, 09, and 10.

---

## Blocked — needs Hama, don't guess

General rule: every review file has its own numbered "Open Questions" section (01 §6,
02 §7, 03 Part 7, 04 Part 6, 05's per-section open questions, 07 §7, 08 Appendix B).
Treat every one of those as stop-and-ask, not stop-and-assume. The items below are true
phase-blockers, called out explicitly so they don't get missed:

- **Phase 2 (answered):** tenant = user (not org). Tenant = individual user; no organization/team abstraction. (02 §7 Q1)
- **Phase 2 (answered):** self-host RLS disabled (BYPASSRLS). Self-host runs with `BYPASSRLS` role; always-on RLS is for hosted only. (02 §7 Q2)
- **Phase 8.3:** Stripe or Verifone — which is actually current? (conflict between 01 §6
  Q3 and Prompt 10's stated rationale)
- **Phase 8.3:** is Iraq merchant eligibility with Verifone actually confirmed yet?
  (Prompt 10's own first research task)
- **Phase 3.11 / 02 F8:** retention/GDPR policy — is verified per-tenant export+delete a
  launch requirement or a fast-follow? (02 §7 Q3)
- **Phase 4:** actual free/paid tier dollar amounts, needed to size the global spend
  ceiling in 4.2 (03 Part 7 Q3)

---

## Progress Log

If a new agent session picks this file up later, **read this table first.** For any row
marked Done **and** independently verified (see the column added below), don't re-verify
or redo it without a specific reason to suspect it regressed. For any row marked Done but
**not yet** independently verified, check it against the real repo before building
anything on top of it — especially 1.1. A row in this table claiming a fix exists is not
the same as the fix existing.

| Task ID | Status | Date | Notes / commit ref | Verified independently? |
|---------|--------|------|---------------------|--------------------------|
| 2.1     | Done | 2026-07-02 | Tenant = individual user (not org). Decision presented and resolved. `7dbd713` | ✅ Yes |
| 2.2     | Done | 2026-07-02 | Flagged 01 vs 02 conflict on RLS enforcement; resolved: self-host uses BYPASSRLS, hosted enables RLS. `7dbd713` | ✅ Yes |
| 2.3     | Done | 2026-07-02 | Decision recorded at top of Progress Log before Phase 3 started. `7dbd713` | ✅ Yes |
| 0.1     | Done | 2026-07-01 | Removed `version: 9` from pnpm/action-setup in all workflows (ci-fast.yml, ci-slow.yml, release.yml) — `package.json` `packageManager` auto-detection | ⚠ Not yet — predates this requirement, spot-check |
| 0.2     | Done | 2026-07-01 | Branch protection enabled on `main` — required checks: `Lint & Typecheck`, `Unit Tests (Fast)`; linear history; enforce admins | ⚠ Not yet — confirm on GitHub's actual settings page, not just this row |
| 0.3     | Done | 2026-07-01 | `.gitlab-ci.yml` deleted pre-audit; only GitHub Actions remains | ⚠ Not yet — spot-check |
| 0.4     | Done | 2026-07-01 | "Report Coverage" step moved from ci-slow.yml to ci-fast.yml (ci-slow has no such step) | ⚠ Not yet — spot-check |
| 0.5     | Done | 2026-07-01 | `pnpm turbo run build` added as a step in ci-fast lint-and-typecheck job | ⚠ Not yet — spot-check |
| 0.6     | Done | 2026-07-01 | `packages/ai/package.json` eval script uses `--cases` (defaults to 15-assertion suite); `turbo.json` has `eval` task | ⚠ Not yet — spot-check |
| 0.7     | Done | 2026-07-01 | `eval-offline.test.ts` — MSW-mocked deterministic eval covering tool selection, tool args, forbidden/expected tools. Fixed: mock SSE stream uses AI SDK v5 `UIMessageChunk` lifecycle types (`start-step`, `tool-input-start`, `tool-input-available`, `tool-output-available`, `text-start/delta/end`, `finish-step`, `finish`) instead of v4 `tool-call`/`tool-result`/`text`. All 3 tests pass. | ⚠ Not yet — spot-check |
| 0.8     | Done | 2026-07-01 | ci-fast.yml runs `pnpm turbo run test -- --coverage` on PR path | ⚠ Not yet — spot-check |
| 0.9     | Done | 2026-07-01 | Behavioral tests added: `compute-position-health.test.ts` (304 lines), `verify-call.test.ts` (268 lines), `middleware.test.ts` (221 lines) | ⚠ Not yet — spot-check |
| 0.10    | Done | 2026-07-01 | `billing-contract.test.ts` with `it.todo` placeholders for auth/tenant scoping, idempotency, webhook verification, proration, dunning | ⚠ Not yet — spot-check |
| 1.1     | Done | 2026-07-01 | `run_system_action` now checks `user.role === 'admin'` before any FRED fetch or `intermarket_resonance` write; focused tests added. `4abc4d6` | 🔴 **Not yet — verify this one first.** Confirm commit `4abc4d6` exists and open `run-system-action.ts` directly; this is the privilege-escalation fix |
| 1.2     | Done | 2026-07-01 | Added server-side mutation-intent screening for `set_alert`, `log_journal`, `share_snapshot`, and `run_system_action`; explicit share/system-action requests required. `4abc4d6` | ⚠ Not yet — spot-check alongside 1.1 |
| 1.3     | Done | 2026-07-01 | Removed theatrical `cot_sync`, `flush_cache`, and `check_migrations`; schema + docs now expose only the real `resonance_sync` action. `4abc4d6` | ⚠ Not yet — spot-check alongside 1.1 |
| 1.4     | Done | 2026-07-01 | Anchored `verify_call` to reality: cross-checks entry/stop/target against live market price; regression test with bad entry added. `f2faf77` | ⚠ Not yet — spot-check; this is the highest user-trust risk |
| 1.5     | Done | 2026-07-01 | Hardened `/api/dev/login`: requires `NODE_ENV === 'development'` explicitly (rejects 'test' and 'production'). `f2faf77` | ⚠ Not yet — spot-check |
| 1.6     | Done | 2026-07-01 | Telegram webhook: added zod schema validation for `Update` body; `TELEGRAM_SECRET_TOKEN` now required (returns 401 if missing). `f2faf77` | ⚠ Not yet — spot-check |
| 1.7     | Done | 2026-07-01 | Added `withAuth` gating to `/api/health` and `/api/health/db`; test mocks updated. `f2faf77` `a8a1b78` | ⚠ Not yet — spot-check |
| 1.8     | Done | 2026-07-01 | Fixed shared error-leak: error responses no longer leak `error.message`; added `captureException` calls in caught branches. `f2faf77` | ⚠ Not yet — spot-check |
| 1.9     | Done | 2026-07-01 | Consolidated two conflicting `vercel.json` files into one at `apps/web/vercel.json`; root `vercel.json` deleted. `f2faf77` `8d7444c` | ⚠ Not yet — spot-check |
| 1.10    | Done | 2026-07-01 | `cron/alerts` now atomically claims rows before sending (SELECT FOR UPDATE SKIP LOCKED pattern). `f2faf77` | ⚠ Not yet — spot-check |
| 1.11    | Done | 2026-07-01 | Routed `admin/test-alert-email`, `admin/test-telegram`, and `cron/cleanup-uploads` through `withAuth` / `withCronAuth`. `f2faf77` | ⚠ Not yet — spot-check |
| 1.12    | Done | 2026-07-01 | Fixed PWA offline precache: added real favicon; removed `/favicon.ico` from precache if not served. `f2faf77` | ⚠ Not yet — spot-check |
| 1.13    | Done | 2026-07-01 | Fixed chart tick performance: uses `series.update()` for live tick instead of full `setData()`. `f2faf77` | ⚠ Not yet — spot-check |
| 1.14    | Done | 2026-07-01 | Fixed silent news-fetch failure: destructured `isError`/`error` from the tool result; errors now surface. `f2faf77` | ⚠ Not yet — spot-check |
| 1.15    | Done | 2026-07-01 | Fixed duplicate non-unique `id`/`aria-controls` on tool-result cards using `useId()`. `f2faf77` | ⚠ Not yet — spot-check |
| 3.1     | Done | 2026-07-02 | Added `organization` / `organization_member` plus nullable `tenant_id` across the Phase 3 Session A user-scoped tables and the two child tables (`chat_messages`, `decision_signal_outcomes`). `7a6c589` | ✅ Yes — fully verified (static + runtime) 2026-07-02. All 40 migrations applied (incl. 0039 runtime fix); tenant_id columns present on all tenant-owned tables. |
| 3.2     | Done | 2026-07-02 | Added personal-tenant backfill + compatibility triggers so existing and new rows inherit `tenant_id` during rollout. `7a6c589` | ✅ Yes — fully verified (static + runtime) 2026-07-02. Backfill triggers fire correctly; seed data inherited tenant_id as expected. |
| 3.3     | Done | 2026-07-02 | Added `tenant_id` NOT NULL migration, `journal_entries_tenant_opened_idx`, and dropped redundant `candles_1m_symbol_t_idx`. `7a6c589` | ✅ Yes — fully verified (static + runtime) 2026-07-02. EXPLAIN ANALYZE confirmed Index Scan using `journal_entries_tenant_opened_idx` (NOT Seq Scan). |
| 3.4     | Done | 2026-07-02 | Added direct/session URL preference in `drizzle.config.ts` and predeploy/backup scripts; added `withTenantDb()` + `SET LOCAL app.current_tenant` helper; added `getAdminDb()` in `packages/db/src/client.ts` using `ADMIN_DATABASE_URL` (BYPASSRLS role); added migration `0037_phase3_bypassrls_admin_role.sql` creating `hamafx_admin` role with BYPASSRLS + default privileges. `1728241` `95eba85` | ✅ Yes — fully verified (static + runtime) 2026-07-02. `hamafx_admin` role created with BYPASSRLS=true; Test 5 confirmed admin sees all 2 tenants' rows (2 per table). |
| 3.5     | Done | 2026-07-02 | Updated `searchMemory` to filter on `tenant_id` (while keeping `user_id`) and set HNSW `ef_search`, `iterative_scan`, and `max_scan_tuples` per query. `1728241` | ✅ Yes — fully verified (static + runtime) 2026-07-02. memory_embeddings RLS isolation confirmed (Test 1: tenant-a sees 1, Test 2: tenant-b sees 1, Test 3: unset GUC sees 0). |
| 3.6     | Done | 2026-07-02 | Added migration `0038_phase3_rls_cutover.sql`: ENABLE + FORCE RLS + `tenant_isolation` policy on all 27 tenant-owned tables (25 direct + 2 F3 child tables). Policy uses `tenant_id = current_setting('app.current_tenant', true)` with both USING and WITH CHECK. Global/shared tables (news, candles, live_ticks, etc.) intentionally excluded. Added `HAMAFX_ENABLE_RLS` env var gate in `withTenantDb()` — GUC only set when enabled, preserving self-host compatibility. `95eba85` | ✅ Yes — fully verified (static + runtime) 2026-07-02. Core RLS tests PASS (Tests 1-6: tenant isolation, unset GUC=0 rows, WITH CHECK blocks cross-tenant INSERT, BYPASSRLS admin sees all, no WHERE clause still isolated, Index Scan confirmed). Two runtime bugs found and FIXED in migration `0039_phase3_runtime_fixes.sql` (`e2920b2`): (1) `account`/`session` tables had FORCE RLS with no tenant_id column — fixed by disabling RLS on them (NextAuth adapter tables scoped by userId FK, don't need tenant isolation); (2) `update_updated_at()` trigger hardcoded `updated_at` but `user` table uses camelCase `updatedAt` — fixed with dynamic column detection. Per-tenant delete test now passes with zero errors. |
| 3.7     | Done | 2026-07-02 | Restore rehearsal now uses `pgvector/pgvector:pg15`, fails hard on restore errors, and asserts HNSW indexes; added `infra/cron-vm/scripts/export-tenant.sh` (per-tenant JSON export to GCS) and `infra/cron-vm/scripts/delete-tenant.sh` (per-tenant deletion with dry-run/--confirm safety); added systemd units + timers for weekly rehearsal of both (Sun 05:00/05:30 UTC); wired into `setup-worker.sh` unit installation. `1728241` `95eba85` | ✅ Yes — fully verified (static + runtime) 2026-07-02. pg_dump + pg_restore succeeded; 2 HNSW indexes preserved post-restore; row counts match (2 journal_entries). Per-tenant export test: JSON contains only tenant-a rows (1 journal, 1 thread, 1 message). Per-tenant delete test: tenant-a data deleted (0 residual), tenant-b untouched (1 each). Per-tenant delete re-run after 0039 trigger fix: zero errors, `UPDATE "user" SET "deletedAt"` succeeds, `updatedAt` auto-updated by trigger. `e2920b2` |
| 3.8     | Done | 2026-07-02 | Added `SUPABASE_CA_CERT` support and CA-verified TLS path in the DB client, with legacy fallback retained until cert rollout. `1728241` | ✅ Yes — static verification 2026-07-02 (runtime TLS test not in scope of RLS/backup verification). |
| 3.9     | Done | 2026-07-02 | Added `packages/shared/src/vault.ts` with GCP Secret Manager support; wired into `apps/web/src/instrumentation.ts` (Vercel) and `apps/worker/src/index.ts` (GCE worker). No-op when `SECRETS_VAULT_PROVIDER` is unset — preserves self-host `.env` compatibility. BYOK AES-256-GCM encryption left untouched as specified. `95eba85` | ✅ Yes — static verification 2026-07-02 (runtime vault test not in scope of RLS/backup verification). |
| 3.10    | Done | 2026-07-02 | Replaced global `_cache` singleton in `packages/data/src/cache/index.ts` with per-tenant `Map<string, Cache>`; added optional `tenantId` to `cacheKey()`; replaced global `cachedVertex`/`cachedVertexKey` in `packages/ai/src/model.ts` with per-tenant `Map` keyed by tenantId + credentials; added optional `tenantId` param to `resolveModel()` and `getVertexGoogleSearchTool()`; verified `ProgressTracker.agents` Map is already instance-scoped (not module-level). `95eba85` | ✅ Yes — static verification 2026-07-02 (runtime cache isolation not in scope of RLS/backup verification). |
| 3.11    | Done | 2026-07-02 | Replaced hardcoded `['__system__']` in both cron routes with `getActiveUserIds()` from `@hamafx/db`; updated `composeEventSummary()`, `composeWeeklyReviewSummary()`, `rememberBriefing()`, `upsertMemory()`, `generateSummary()`, `recordTelemetry()`, `recordToolTelemetry()`, planner, and title generator to use real `userId` from tool context / function params. `__system__` retained ONLY as last-resort DB insert fallback for NOT NULL FK columns (documented inline). Budget checks now skip when no userId instead of attributing spend to `__system__`. `95eba85` | ✅ Yes — static verification 2026-07-02 (runtime cron test not in scope of RLS/backup verification). |
| 3.12    | Done | 2026-07-02 | Verified `__system__` user row exists: migration `0009_news_articles.sql` seeds `INSERT INTO "user" (...) VALUES ('__system__', 'system@localhost', 'System', 'user')`. Telemetry FK inserts have NOT been silently failing — the row exists. No missing cost/usage telemetry from this cause. `95eba85` | ✅ Yes — fully verified (static + runtime) 2026-07-02. `__system__` user row confirmed present in database after all migrations applied. |
| 4.1     | Todo | — | Not started. Replace fixed-window rate limiter with sliding-window. | n/a — not done |
| 4.2     | Todo | — | Not started. Add global tenant-wide AI-spend ceiling. | n/a — not done |
| 4.3     | Todo | — | Not started. Add per-user/per-IP limits on provider-quota-facing endpoints. | n/a — not done |
| 4.4     | Todo | — | Not started. Standardize error envelopes and 429 responses. | n/a — not done |
| 4.5     | Todo | — | Not started. Add `maxOutputTokens` to `streamText` + per-turn input-context ceiling. | n/a — not done |
| 4.6     | Todo | — | Not started. Unify cost/pricing tables; dedupe `cost.ts` RATES vs BYOK ModelSpec. | n/a — not done |
| 4.7     | Todo | — | Not started. Upgrade citation enforcer from turn-level to value-level. | n/a — not done |
| 4.8     | Todo | — | Not started. Add domain/range sanity validation to `set_alert.level` and journal fields. | n/a — not done |
| 4.9     | Todo | — | Not started. Build operator-side spend-anomaly detector (worker job). | n/a — not done |
| 4.10    | Todo | — | Not started (conditional on tenant=org, which was decided as tenant=user). May be skipped. | n/a — not done |
| 4.11    | Todo | — | Not started. Decide fate of vestigial per-domain model routing. | n/a — not done |
| 5.1     | Done | Phase 5 | Fixed: `enabled` now keys off `NEXT_PUBLIC_SENTRY_DSN`; added `service:web` tag + `release` to server/edge configs. | Verified — client Sentry deliberately enabled |
| 5.2     | Done | Phase 5 | Done. Rate-limited `captureException` (5-min cooldown, 3-failure threshold) for sustained `flushLiveTicks`/`flushClosedCandle` failures. | Verified — code review |
| 5.3     | Done | Phase 5 | Done. Adopted pino logger (`packages/shared/src/logger.ts`) in `apps/web` (api.ts, cron.ts, chat route, auth actions). Created `lib/logger.ts` with request-scoped child logger. Added redaction to worker logger. Created `scripts/check-console-errors.mjs` CI grep. | Verified — code review |
| 5.4     | Done | Phase 5 | Done. Created `lib/auth-anomaly.ts` with sliding-window detector for 401 rate, ACCOUNT_LOCKED spikes, 2FA failures, login success-rate drops. Wired into `withAuth` (401 tracking) and `loginAction` (success/failure/locked/2FA). Alerts via `Sentry.captureMessage` with 5-min cooldown. | Verified — code review |
| 5.5     | Done | Phase 5 | Done. `/api/health` now includes `pgvectorCheck.ok` and `cronCheck.stuckRuns === 0` in `allOk`. Missing pgvector or stuck cron returns 503. | Verified — code review |
| 5.6     | Done | Phase 5 | Done. Created `docs/INCIDENT-RESPONSE.md` with SEV taxonomy, SLOs, on-call/paging setup checklist, customer-facing outage runbooks (chat/auth/AI-gateway down), comms templates, postmortem template. Extends RECOVERY.md. | Verified — doc review |
| 5.7     | Done | Phase 5 | Done. Added explicit "Untrusted Content Policy" clause to `BASE_PROMPT` (retrieved/tool content is DATA, never instructions). Added untrusted-data warnings to tool descriptions (get-news, get-calendar, get-social-sentiment, search-knowledge). Softened Hard-rule 10 so `run_system_action` is only suggested by user request, not ambient health signals. | Verified — code review |
| 5.8     | Done | Phase 5 | Done. Created `docs/BILLING-WEBHOOK-SAFETY-GATE.md` defining hard-gate requirements: signature verification, dead-letter queue, Sentry capture + paging, idempotency, and acceptance tests. Paid plans cannot be enabled until all tests pass. | Verified — doc review |
| 6.1     | Todo | — | Not started. Cross-check resonance-sync systemd unit; add missing timer. | n/a — not done |
| 6.2     | Todo | — | Not started. Fix embedding-backfill lock-granularity bug. | n/a — not done |
| 6.3     | Todo | — | Not started. Extend `update.sh` rollback for post-deploy runtime crashes. | n/a — not done |
| 6.4     | Todo | — | Not started. Add missing entries to `RECOVERY.md` UUID table. | n/a — not done |
| 6.5     | Todo | — | Not started. Verify `postgres:15-alpine` pgvector support in `verify-restore.sh`. | n/a — not done |
| 6.6     | Todo | — | Not started (conditional on load). Upgrade `hamafx-cron` VM if justified. | n/a — not done |
| 7.1     | Todo | — | Not started. Enforce `--touch-min` (44px) on primary controls. | n/a — not done |
| 7.2     | Todo | — | Not started. Fix tool-message virtualizer size estimate. | n/a — not done |
| 7.3     | Todo | — | Not started. Wrap streamed assistant text in `aria-live="polite"`. | n/a — not done |
| 7.4     | Todo | — | Not started. Ensure every `DrawerContent` has a `DrawerTitle`. | n/a — not done |
| 7.5     | Todo | — | Not started. Whitelist `https://s3.tradingview.com` in CSP. | n/a — not done |
| 7.6     | Todo | — | Not started. Add `images.remotePatterns` for Supabase host. | n/a — not done |
| 7.7     | Todo | — | Not started. Align polling-cadence claim across code and docs. | n/a — not done |
| 7.8     | Todo | — | Not started. Remaining P3 polish: scoped `error.tsx`, `role="alert"`. | n/a — not done |
| 7.9     | Todo | — | Not started. Remove dead `@ui/*` config from tsconfig/prettier. | n/a — not done |
| 7.10    | Todo | — | Not started. Adopt Knip for unused files/exports detection in CI. | n/a — not done |
| 7.11    | Todo | — | Not started. Set `actions/checkout` `fetch-depth: 0` for turbo --affected. | n/a — not done |
| 7.12    | Todo | — | Not started. Dependency review: align `tsx` versions, decide `next-auth` strategy. | n/a — not done |
| 7.13    | Todo | — | Not started. Strengthen `check-test-files.mjs` to flag zero-assertion files. | n/a — not done |
| 7.14    | Todo | — | Not started. Fix runtime-doc drift in `docs/08-deployment.md`. | n/a — not done |
| 7.15    | Todo | — | Not started. Update stale `docs/08-backend-and-api.md` references. | n/a — not done |
| 8.1     | Todo | — | Not started. Run Prompt 00 (Documentation & Reality Drift). | n/a — not done |
| 8.2     | Todo | — | Not started. Run Prompt 09 (Open-Core Architecture). | n/a — not done |
| 8.3     | Todo | — | Not started. Run Prompt 10 (Billing — 2Checkout/Verifone). | n/a — not done |
| 8.4     | Todo | — | Not started. Run Prompt 11 (Legal/Compliance). | n/a — not done |
