# HamaFX-Ai — Admin Panel Deep Upgrade Brief

> **Audience:** an autonomous AI coding agent with write access to the `HamaFx/hamafx-ai` monorepo.
> **Mission:** Take the existing `/admin` surface from "functional MVP" to "fully efficient, advanced, production-grade operator console." Fix every bug, close every security gap, wire up every orphaned endpoint, add missing capabilities, and polish the UX/a11y — **without regressing existing behavior or breaking the single-user deployment model.**
> **Author of this brief:** a prior analysis agent that cloned the repo and read every admin file end-to-end. File paths and line references below were verified against `main` at commit `f70d7d41`.

---

## 0. How to work in this repo (read first)

**Stack & tooling (from `AGENTS.md`):**
- Monorepo managed with **pnpm 9.15.4** + **turbo**. Node version pinned in `.nvmrc`.
- Web app: **Next.js App Router** (`apps/web`), React 19, TypeScript strict, Tailwind with **design tokens** (`text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-bg-elev-1/2/3`, `border-border`, `text-brand`, `bg-success/warn/danger`, etc. — never hardcode hex colors).
- Icons: `@tabler/icons-react`. Toasts: `sonner`. UI primitives live in `apps/web/src/components/ui/*` (`Button`, `Switch`, `EmptyState`, `SkeletonCard`, `confirm-drawer`'s `useConfirm`).
- Tests: **Vitest** (`.test.ts`), Playwright E2E. DB tests run against **PGlite**.
- Lint/format: ESLint flat config + Prettier.

**Commands you must run before declaring done:**
```bash
pnpm typecheck
pnpm lint
pnpm --filter @hamafx/web test -- --run
pnpm --filter @hamafx/web build            # ensure the app still builds
# If you touch DB/schema:
pnpm --filter @hamafx/db migrate:gen
pnpm --filter @hamafx/db migrate:status
```
- Always pass `-- --run` to vitest (never leave it in watch mode).
- **All new migrations must be idempotent** (`IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... $$` guards). CI applies every migration twice.

**House conventions to imitate (do NOT invent new patterns):**
- **API routes** are *thin controllers*: parse request → call a service in `apps/web/src/lib/services/*` → format `Response`. Put real logic in the service layer (see `apps/web/src/lib/services/admin.ts`).
- Admin routes wrap handlers in **`withAdminAuth`** from `apps/web/src/lib/admin-auth.ts`. Non-admin authed routes use **`withAuth`** from `apps/web/src/lib/api.ts`. **These are NOT interchangeable — see Finding S-1.**
- Request parsing: `parseSearchParams(req, zodSchema)` and `parseJsonBody(req, zodSchema)` from `apps/web/src/lib/api`.
- Client data fetching: `apiFetch<T>(url)` and `apiMutate(url, init)` from `apps/web/src/lib/api-client`. `ApiError` carries `code`, `status`, and `requestId` — **surface `requestId` in error toasts** (only `admin-cron-table.tsx` currently does this; make it universal — see Finding B-6).
- Section shell: wrap each panel in `<SettingsSection title description>` (imported from `apps/web/src/app/(app)/settings/_components/settings-section`).
- CSP: middleware (`apps/web/src/middleware.ts`) sets a `strict-dynamic` CSP with a per-request nonce. Inline scripts need the nonce or the route must be exempted (the architecture-explorer route is the one exemption). Do not add new inline-script routes casually.
- Every source file starts with `// SPDX-License-Identifier: Apache-2.0`.

**Deployment model nuance (critical):** The app supports both **single-user** (self-hosted operator; no `role='admin'` row exists, so the *earliest-created* user is treated as admin — see `admin-auth.ts:getAdminUser`) and **multi-user** (explicit `role='admin'`). Every change must be correct in BOTH modes. Several dev-only routes are gated by `NODE_ENV !== 'production'` and/or feature-env flags; preserve those gates.

---

## 1. The admin surface as it exists today (inventory)

**Page shell & tabs** — `apps/web/src/app/(app)/admin/`
- `layout.tsx` — server component; calls `checkIsAdmin()` and `redirect('/chat')` if not admin. Renders `<h1>Admin</h1>` + children.
- `page.tsx` — client component. 8 lazy-loaded tabs via `next/dynamic` held in local `useState('health')`. Tabs: **Health, Onboarding, Cron, Telemetry, Traces, Users, Features, Logs**. Plus an external-link button to the **Architecture Explorer** (`/api/admin/architecture-explorer`, opens new tab).
- `loading.tsx`, `error.tsx` — route-level fallbacks.
- `_components/`: `admin-system-health.tsx` (404 lines, auto-refresh 30s), `admin-onboarding-control.tsx`, `admin-cron-table.tsx`, `admin-tool-telemetry-table.tsx`, `admin-diagnostic-traces.tsx`, `admin-user-table.tsx`, `admin-feature-flags.tsx`, `admin-log-viewer.tsx`.

**API routes** — `apps/web/src/app/api/admin/`
- `architecture-explorer/route.ts` — `withAdminAuth`; serves `public/architecture-explorer.html` with a permissive CSP.
- `cron-history/route.ts` — `withAdminAuth`; `?days` (1–90), `?jobName`.
- `diagnostics/tool-telemetry/route.ts` — `withAdminAuth`; `?threadId`, `?ok`, `?limit` (≤100).
- `diagnostics/traces/route.ts` — `withAdminAuth`; `?threadId`, `?limit` (≤100).
- `diagnostics/trace/[id]/route.ts` — **inlines** the admin-auth boilerplate (does not use `withAdminAuth` because it needs `params`); returns a single trace.
- `features/route.ts` — `withAdminAuth`; GET list, POST `Record<string,boolean>` toggle.
- `flush/route.ts` — `withAdminAuth` + **dev-only**; targets `cache|sessions|cron_locks|all`.
- `health-slo/route.ts` — `withAdminAuth`; `?hours` (1–720, default 24). Computes SLIs from telemetry tables.
- `impersonate/route.ts` — `withAdminAuth` + **dev-only** + `ENABLE_IMPERSONATION==='true'`; signed challenge.
- `logs/stream/route.ts` — **dev-only** SSE; inlines admin-auth boilerplate; requires `ENABLE_LOG_STREAM=true`.
- `onboarding/inspect/route.ts` — `withAdminAuth`; richer than status (adds `hasApiKeys`, `apiProviders`, `language`).
- `onboarding/reset/route.ts` — `withAdminAuth`; `?userId`, `mode: full|soft`.
- `onboarding/status/route.ts` — `withAdminAuth`; `?userId`.
- `test-alert-email/route.ts` — **`withAuth` (NOT admin!)**; sends Resend email; accepts `to`.
- `test-telegram/route.ts` — **`withAuth` (NOT admin!)**; sends Telegram msg; accepts `chatId`.
- `users/route.ts` — `withAdminAuth`; `?limit` (≤100), `?offset`.

**Service layer** — `apps/web/src/lib/services/admin.ts` (feature flags + user list/count).

**Tests** — `apps/web/test/admin/`: `admin-auth.test.ts`, `features.test.ts`, `onboarding-reset.test.ts`, `users.test.ts`.

---

## 2. Findings & required work

Each finding has: **ID · Severity · Location · Problem · Required fix · Acceptance.**
Severity scale: **P0** (security/data-loss/correctness — do first), **P1** (real bug or major gap), **P2** (perf/architecture), **P3** (UX/polish/nice-to-have).
Implement in severity order. Group related changes into logically-scoped commits.

### 2A. Security & correctness (do these first)

---
**S-1 · P0 · Privilege gap: `test-alert-email` & `test-telegram` are only `withAuth`, not `withAdminAuth`**
- Location: `apps/web/src/app/api/admin/test-alert-email/route.ts`, `apps/web/src/app/api/admin/test-telegram/route.ts`.
- Problem: Both live under `/api/admin/*` but are wrapped in `withAuth` (session-only) instead of `withAdminAuth`. In **multi-user mode any authenticated non-admin user can call them.** Worse, the request body accepts a caller-controlled recipient — `to` (email) and `chatId` (Telegram) — so a non-admin authed user can make the server send mail **from your verified Resend domain to an arbitrary address**, or a Telegram message to an arbitrary chat. That is an authenticated open-relay / spam & phishing vector and an abuse of your Resend/Telegram quota and domain reputation.
- Required fix:
  1. Switch both handlers to `withAdminAuth`. Because `withAdminAuth` currently passes `(req, { user })` (no `params`), that signature is fine here — both are param-less POSTs. Keep the `withAuth`-style envelope/status codes.
  2. **Lock down the recipient override.** By default, ignore `to`/`chatId` from the body and always send to the server-configured `ALERT_TO_EMAIL` / `TELEGRAM_CHAT_ID`. Only honor an override when an explicit env allowlist permits it (e.g. `ALERT_TEST_ALLOW_OVERRIDE==='true'`), and when present validate `to` against a small allowlist or at minimum re-confirm admin. Document the decision in the file header.
  3. Add a rate limit (per-admin, e.g. max 5/min) using whatever limiter utility exists in the repo (search `apps/web/src/lib` for `rateLimit`/`ratelimit`; if none, add a tiny in-memory token bucket keyed by userId — acceptable because these are dev/ops tools).
- Acceptance: New/updated tests in `apps/web/test/admin/` prove: (a) a non-admin session gets 403; (b) unauthenticated gets 401; (c) with override disabled, a body `to`/`chatId` is ignored and the configured recipient is used; (d) missing env still returns 503 with variable NAMES only (never values). `grep -rn "withAuth" apps/web/src/app/api/admin` returns **no** matches.

---
**S-2 · P1 · Missing user-role management endpoint + audit trail for privileged actions**
- Location: no `PATCH`/role route exists under `apps/web/src/app/api/admin/users`; `admin-user-table.tsx` shows role read-only.
- Problem: There is no supported way to promote/demote users, yet multi-user admin is a first-class concept. Operators must edit the DB by hand. Also, privileged mutations (feature toggles, onboarding reset, role changes, impersonation) are only logged ad-hoc via `log.info` in `withAdminAuth`; there is no queryable **admin audit log**.
- Required fix:
  1. Add `apps/web/src/app/api/admin/users/[id]/role/route.ts` (`PATCH`, `withAdminAuth` with params — see S-6 refactor). Body: `{ role: 'admin' | 'user' }` via zod. Delegate to a new `updateUserRoleService` in `services/admin.ts` → new DB helper `updateUserRole(userId, role)` in `@hamafx/db`.
  2. **Guardrails:** refuse to demote the last remaining admin (count admins; if demoting would leave zero, return 409 `LAST_ADMIN`). Refuse self-demotion with a clear message. In single-user mode (no explicit admin rows) promoting the sole user is a no-op success.
  3. Add an `admin_audit_log` table (idempotent migration in `packages/db`): `id, actor_user_id, action, target_user_id (nullable), metadata jsonb, created_at`. Write an entry from a shared `recordAdminAudit()` helper invoked by role changes, onboarding resets, feature toggles, and impersonation. Expose `GET /api/admin/audit?limit&offset` + a new **Audit** tab (see F-4).
- Acceptance: tests cover promote/demote happy path, last-admin protection (409), self-demote protection, and that each privileged action writes exactly one audit row. Migration applies twice cleanly against PGlite.

---
**S-3 · P2 · `admin-auth` single-user promotion has a check-then-act race and is uncached per-request**
- Location: `apps/web/src/lib/admin-auth.ts:getAdminUser`.
- Problem: In single-user mode it does two sequential reads (count admins, then earliest user). Under concurrent first-time registrations this is a theoretical TOCTOU. Also `getAdminUser` hits the DB on every admin API call; only the server-component path is `cache()`d (via `checkIsAdmin`).
- Required fix: (a) Collapse the "no admin exists → earliest user is admin" logic into a single query (e.g. a `SELECT ... ORDER BY created_at LIMIT 1` combined with a `NOT EXISTS (role='admin')` guard, or a `bool_or(role='admin')` window) so the decision is atomic. (b) Add a short request-scoped memo (React `cache()` is only for RSC; for route handlers, memoize within the request via a `WeakMap` keyed on the `Request`, or accept the current cost and just document it). Do not change external behavior. Keep the security comment intact.
- Acceptance: existing `admin-auth.test.ts` still passes; add a test asserting only the earliest user is promoted when two users exist and no admin role is set.

---
**S-4 · P2 · Architecture-explorer route reads from disk on every request with a broad `unsafe-inline` CSP**
- Location: `apps/web/src/app/api/admin/architecture-explorer/route.ts`.
- Problem: `readFileSync` on every GET (no cache), and the CSP allows `script-src 'self' 'unsafe-inline'`. It is admin-gated so risk is low, but it is the loosest CSP in the app.
- Required fix: (a) Cache the file contents in module scope after first successful read (invalidate never needed — it is a build artifact); keep the `no-store` HTTP cache headers so the CDN never serves stale CSP, but avoid re-reading disk. (b) If feasible, tighten the CSP by hashing the inline scripts (`'sha256-...'`) instead of `'unsafe-inline'`; if the generator makes hashing impractical, leave a `// SECURITY:` comment explaining why `unsafe-inline` is retained and that the route is admin-only + isolated.
- Acceptance: route still serves the explorer; a second request does not touch the filesystem (assert via a spy or by counting `readFileSync` calls in a test).

---
**S-5 · P2 · `flush` "sessions"/"cache" targets are silent no-ops that report success**
- Location: `apps/web/src/app/api/admin/flush/route.ts`.
- Problem: For `cache` and `sessions` the handler pushes the label into `flushed` and returns `ok:true` even though nothing happens (JWT sessions can't be globally invalidated without rotating secrets; in-memory caches are per-instance). This misleads the operator.
- Required fix: Return a per-target **status** object, e.g. `{ results: [{ target:'cron_locks', status:'flushed', affected: n }, { target:'sessions', status:'unsupported', reason:'JWT sessions are stateless; use tokenVersion bump / sign-out-everywhere' }] }`. Wire real behavior where it exists: `sessions` should call the existing "sign out everywhere" / `tokenVersion` bump path (search `apps/web/src/auth*.ts` and `@hamafx/db` for `tokenVersion`). Keep the dev-only gate.
- Acceptance: response distinguishes real vs. unsupported flushes; test asserts `cron_locks` reports an affected count and `sessions` reports `unsupported` (or performs the tokenVersion bump if wired).

---
**S-6 · P1 · Duplicated inline admin-auth boilerplate in param routes; no `withAdminAuth` variant that receives `params`**
- Location: `diagnostics/trace/[id]/route.ts` and `logs/stream/route.ts` both hand-roll the 401/403 envelope that `withAdminAuth` already produces.
- Problem: Copy-pasted auth logic drifts and is easy to get subtly wrong (one of the very risks behind S-1).
- Required fix: Extend `withAdminAuth` (or add `withAdminAuthParams`) in `admin-auth.ts` to support the Next.js `(req, ctx: { params: Promise<T> })` signature, mirroring how `withAuth` in `api.ts` already threads `params`. Refactor `trace/[id]` and `logs/stream` to use it. This also unblocks S-1/S-2 param routes.
- Acceptance: no admin route inlines the 401/403 block; `grep -rn "Admin access required" apps/web/src/app/api/admin` matches only `admin-auth.ts`. All existing admin tests pass.

### 2B. Functional bugs

---
**B-1 · P1 · `health-slo` loads the ENTIRE `live_ticks` table on every poll and miscounts "symbols"**
- Location: `apps/web/src/app/api/admin/health-slo/route.ts` (the `live_ticks` query).
- Problem: `SELECT symbol, ts, EXTRACT(EPOCH FROM (NOW()-ts))::int AS age_s FROM live_ticks ORDER BY ts DESC` has **no `LIMIT` and no aggregation**. It reads every row just to read `rows[0]` (newest) and set `tickSymbols = rows.length`. On a busy tick table that is thousands of rows per request — and the dashboard **auto-refreshes every 30s** (B-4), multiplying the cost. Also `tickSymbols = rows.length` is the **row count, not the distinct-symbol count**, yet the UI copy says "across N symbols" — a correctness bug.
- Required fix: Replace with a single aggregate query, e.g.:
  ```sql
  SELECT
    COUNT(DISTINCT symbol)                            AS symbol_count,
    MAX(ts)                                           AS newest_ts,
    EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::int        AS newest_age_s
  FROM live_ticks
  ```
  Use `symbol_count` for the "N symbols" label and `newest_age_s` for freshness. Keep the `try/catch` "table may not exist" tolerance.
- Acceptance: query returns one row; UI "N symbols" reflects distinct symbols; add a test (PGlite) seeding several ticks across 2 symbols and asserting `symbol_count===2` and correct freshness.

---
**B-2 · P2 · `health-slo` runs ~6 DB round-trips sequentially**
- Location: same file — DB check, ticks, cron, tool telemetry, chat turns, analysis jobs run one after another with independent `try/catch`.
- Problem: Serial `await`s add latency; combined with 30s auto-refresh this is wasteful.
- Required fix: Run the independent aggregate queries concurrently with `Promise.allSettled` (preserve the per-query "table may not exist" tolerance by inspecting each settled result). Keep the DB `SELECT 1` latency probe separate/first. Do not change the response shape.
- Acceptance: response identical for a given DB state; add a timing/structural test if practical, otherwise ensure existing behavior via a snapshot test of the computed SLIs.

---
**B-3 · P1 · Orphaned endpoints: `diagnostics/trace/[id]`, `onboarding/inspect`, `impersonate`, `flush` have NO UI**
- Location: UI in `admin/_components/*`; endpoints listed in §1.
- Problem: Real, tested server capabilities are unreachable from the panel:
  - **Trace detail** (`diagnostics/trace/[id]`) — the Traces table rows are not clickable; there is no drill-down showing steps/errors/timeline. The endpoint is dead weight from the UI's perspective.
  - **Onboarding inspect** — the richer inspector (`hasApiKeys`, `apiProviders`, `language`) is never used; the Onboarding tab uses the thinner `/status` and only ever targets the admin's OWN account.
  - **Impersonate** (dev-only) and **Flush** (dev-only) — no controls at all.
- Required fix: Wire each into the UI (details in §2E Missing Features F-1…F-3 and the Traces drill-down in F-5). At minimum, every admin endpoint must be reachable from the panel or explicitly removed with justification.
- Acceptance: navigating the panel can reach every non-deprecated admin endpoint; dev-only tools are hidden/disabled with an explanatory tooltip when their env gate is off.

---
**B-4 · P2 · System Health auto-refreshes every 30s even when the tab/route is not visible**
- Location: `admin-system-health.tsx` (`setInterval(fetchHealth, 30_000)`).
- Problem: The interval keeps firing while the browser tab is backgrounded or the admin is on another admin tab (the component may stay mounted). With B-1/B-2 unfixed this hammers the DB.
- Required fix: (a) Pause polling when `document.visibilityState === 'hidden'` (listen to `visibilitychange`) and resume + immediate refetch on visible. (b) Make the interval configurable and expose the **window selector** (see F-6) — the API already accepts `?hours` (1–720) but the UI hard-codes 24h. (c) Guard against overlapping in-flight requests (skip a tick if one is still pending) and abort on unmount with an `AbortController`.
- Acceptance: no fetches occur while the tab is hidden; changing the window re-queries with the new `?hours`; unmount aborts the in-flight request (no state-update-after-unmount warnings).

---
**B-5 · P1 · User table is capped at 50 with NO pagination, search, or sort**
- Location: `admin-user-table.tsx` (`'/api/admin/users?limit=50&offset=0'` hard-coded) — the API already supports `limit`/`offset` and returns `total`.
- Problem: Deployments with >50 users cannot see or manage the rest. `total` is displayed but unusable. No way to find a specific user.
- Required fix: Add pagination controls (prev/next + page size), an offset state, and a debounced email/name search box (extend the API + `listUsersService`/`listUsersWithSettings` with an optional `q` filter). Add client-side or server-side sort by `createdAt`/`role`. Reuse existing table styling; wrap the table in a `.table-wrapper` (overflow-x) for narrow panels (see UX-3).
- Acceptance: with >50 seeded users, all pages are reachable; search narrows results; `total` reflects the filtered count; keyboard-accessible controls.

---
**B-6 · P2 · Inconsistent error handling — only the Cron table surfaces `requestId`**
- Location: `admin-cron-table.tsx` surfaces `ApiError.requestId` in the toast description (`Ref: …`); `admin-user-table.tsx`, `admin-tool-telemetry-table.tsx`, `admin-diagnostic-traces.tsx`, `admin-feature-flags.tsx`, `admin-onboarding-control.tsx`, `admin-system-health.tsx` do not.
- Problem: Bug reports from most tabs cannot be traced to a single server log line; error UX differs per tab (some inline, some toast-only, some both).
- Required fix: Extract a small shared hook/util (e.g. `useAdminResource<T>(url)` returning `{ data, loading, error, reload }`, or at least a `toastApiError(err)` helper) that: parses `ApiError`, always appends `Ref: {requestId}` when present, and standardizes the inline error+Retry block. Refactor all eight components onto it. This removes ~8 copies of near-identical `fetch/loading/error/retry` boilerplate.
- Acceptance: every tab shows the same error affordance and includes `requestId` when the server returns one; net LOC drops; a unit test covers the helper's `requestId` formatting.

---
**B-7 · P2 · Log viewer: generic error on normal close, no reconnect, and `NODE_ENV` gate is client-side only**
- Location: `admin-log-viewer.tsx`.
- Problem: `source.onerror` always sets "Log stream disconnected…" even on a clean server close or when the feature simply is not enabled (the server returns 503 `NOT_ENABLED`). There is no auto-reconnect/backoff, no autoscroll, no pause, no clear, no download, no search/filter, and no severity coloring. The `process.env.NODE_ENV` check is inlined at build time (fine) but there is no graceful handling of the 503 `NOT_ENABLED` body.
- Required fix: Distinguish "not enabled" (surface the server's `NOT_ENABLED` message) from "disconnected". Add reconnect with capped exponential backoff, an autoscroll-to-bottom toggle, pause/resume, clear, a client-side substring filter, a "download .log" button, and monospace severity coloring (info/warn/error) parsed from the line. Cap retained lines (already 200) but make it configurable. Keep the dev-only server gate authoritative.
- Acceptance: enabling the stream shows lines with autoscroll; a clean disconnect does not show a scary error; disabled feature shows the precise reason; filter and download work.

---
**B-8 · P2 · Feature-flag toggles have no in-flight lock, no optimistic rollback, and no labels/descriptions**
- Location: `admin-feature-flags.tsx` + `services/admin.ts:upsertFeaturesService`.
- Problem: (a) Rapid toggling can race — no per-key disabled/pending state; the UI sets local state only after the await, so double-clicks fire duplicate POSTs. (b) Keys render as raw `snake_case` with no human label, description, or risk indicator. (c) `upsertFeaturesService` loops `await upsertFeatureFlag` sequentially (fine for one key, but no transaction if multiple keys are sent).
- Required fix: (a) Track a `pending: Set<string>` and disable the `Switch` while its POST is in flight; on failure, revert the optimistic value and toast with `requestId`. (b) Introduce a small metadata map (label, description, optional `danger` flag) — either a static registry in the component or, better, returned by the API (extend the DB row/service with optional `label`/`description`). Show descriptions and require `useConfirm` for `danger` flags. (c) Wrap multi-key upserts in a DB transaction.
- Acceptance: cannot double-submit a toggle; failed toggle reverts visibly; dangerous flags require confirmation; labels/descriptions render.

### 2C. Architecture & consistency

---
**A-1 · P2 · Duplicated `SliSnapshot`/`HealthSloData` types across route and component**
- Location: `health-slo/route.ts` defines `SliSnapshot`/`HealthSloResponse`; `admin-system-health.tsx` re-declares near-identical `SliSnapshot`/`HealthSloData`.
- Required fix: Define the response contract once in a shared location (e.g. `apps/web/src/lib/services/admin-health.ts` or a `types` module) and import it in both the route and the component. Do the same for other shared shapes (`UserSummary`, `CronRun`, `ToolTelemetryRow`, `DiagnosticTraceSummary`, `OnboardingStatus`) — centralize DTOs so the client cannot drift from the server.
- Acceptance: a single source of truth per DTO; `typecheck` passes; changing a field in the DTO surfaces as a compile error in both sides.

---
**A-2 · P2 · Health SLO computation lives in the route, not a service**
- Location: `health-slo/route.ts` (~250 lines of logic in the handler) violates the repo's "thin controller" rule that `features`/`users` follow.
- Required fix: Move SLI computation into `services/admin-health.ts` (`computeHealthSlo(db, { hours })`). The route becomes: parse → call service → `Response.json`. This makes the logic unit-testable without HTTP.
- Acceptance: route body is thin; new service has direct unit tests (seed PGlite, assert SLIs/anomalies/overall).

---
**A-3 · P3 · `UserListDTO.users` is typed `any[]`**
- Location: `services/admin.ts` (`// eslint-disable-next-line @typescript-eslint/no-explicit-any`).
- Required fix: Replace with the real `UserSummary` DTO (from A-1). Remove the eslint-disable.
- Acceptance: no `any`; lint passes without the disable.

---
**A-4 · P2 · Tab state is local `useState`, not URL-synced**
- Location: `admin/page.tsx` (`useState('health')`).
- Problem: Refresh loses the active tab; tabs cannot be deep-linked or shared; browser back/forward does nothing.
- Required fix: Sync the active tab to a URL param (e.g. `?tab=health`) or hash using `useSearchParams`/`router.replace` (shallow). Validate against the known tab ids; fall back to `health`. This also enables `error.tsx`/refresh to restore context.
- Acceptance: `/admin?tab=users` opens Users directly; switching tabs updates the URL without a full navigation; unknown tab falls back gracefully.

---
### 2D. Accessibility

---
**UX-1 (a11y) · P1 · Tabs are a button group, not an ARIA tablist**
- Location: `admin/page.tsx` — `<nav><ul>` of `<button aria-pressed>`; content in a `<section aria-live="polite">`.
- Problem: Screen-reader users don't get tab semantics; there is no roving-tabindex arrow-key navigation; `aria-pressed` is the wrong pattern for tabbed panels.
- Required fix: Implement the WAI-ARIA Tabs pattern: container `role="tablist"`, each control `role="tab"` with `aria-selected`, `aria-controls`, and roving `tabIndex` (arrow keys move focus, Enter/Space activate, Home/End jump). The panel gets `role="tabpanel"` + `aria-labelledby` pointing at the active tab. Keep the visual design. Consider an existing headless tabs primitive if the repo already has one (search `components/ui`); otherwise implement minimally.
- Acceptance: keyboard users can arrow between tabs; SR announces "tab, selected, N of M"; axe/Playwright a11y check passes for the admin route.

---
**UX-2 (a11y) · P2 · Auto-refreshing health region isn't announced politely; icons/labels need review**
- Location: `admin-system-health.tsx`.
- Problem: 30s silent data swaps; the overall-status pulse dot is decorative (fine) but the status change should be announced. Refresh button uses `aria-label` (good) — verify all icon-only controls have labels.
- Required fix: Wrap the overall status banner text in an `aria-live="polite"` region so status transitions (healthy→degraded) are announced once. Ensure every icon-only button across all tabs has an accessible name. Ensure color is never the only signal (status text already present — verify for the SLI cards and badges: add text like "OK/FAIL" which telemetry already does; ensure user role/onboarding badges are not color-only — they have text, good).
- Acceptance: axe check clean; a status change is announced; no icon-only control lacks a name.

---
### 2E. Missing features (make it "advanced")

---
**F-1 · P1 · Impersonation UI (dev-only)**
- Add a control (in the Users tab row actions, or a dedicated dev-tools area) that POSTs to `/api/admin/impersonate` with the target `userId`. Only render when the feature is available (surface a disabled state + tooltip when `ENABLE_IMPERSONATION` is off or in production — the client can't read server env, so add a small `GET /api/admin/impersonate` capability probe, or include an `impersonationEnabled` flag in an existing admin bootstrap payload). On success, follow the returned `redirect` to `/chat`. Add a persistent, unmissable **"Impersonating {email} — Exit"** banner (wire an exit endpoint / normal sign-out-back-to-admin path; check `auth.ts` for the impersonation session shape) so the operator can never forget they're impersonating.
- Acceptance: dev-only; blocked in prod; clear enter/exit UX; audit-logged (S-2).

---
**F-2 · P2 · Flush / maintenance UI (dev-only)**
- Add a small maintenance panel that POSTs to `/api/admin/flush` with a target selector (`cron_locks | cache | sessions | all`), `useConfirm` before firing, and renders the per-target `results` from S-5 (flushed vs. unsupported + affected counts). Dev-only gating like F-1.
- Acceptance: honest per-target feedback; confirm-gated; hidden in prod.

---
**F-3 · P2 · Upgrade the Onboarding tab to a per-user inspector using `onboarding/inspect`**
- Today the Onboarding tab only reads `/status` for the admin's own account. Change it to: (a) let the admin pick a target user (reuse the Users search from B-5, or a userId input), (b) fetch the richer `/inspect` payload (adds `hasApiKeys`, `apiProviders`, `language`), (c) show whether the user has BYOK keys and which providers (names only — the endpoint already avoids values), (d) keep reset (soft/full) but require confirm and pass the selected `userId`. Never display secret values.
- Acceptance: admin can inspect & reset ANY user's onboarding; providers listed by name only; reset audit-logged.

---
**F-4 · P2 · Audit log tab**
- Backed by S-2's `admin_audit_log`. New tab **Audit** with a paginated, filterable table (by action, actor, target, date range) showing every privileged action. Read-only.
- Acceptance: privileged actions appear within one refresh; filters + pagination work.

---
**F-5 · P1 · Trace drill-down (wire `diagnostics/trace/[id]`)**
- Make Traces rows clickable → open a detail drawer/modal that fetches `/api/admin/diagnostics/trace/[id]` and renders the step timeline, per-step timings, tool calls, and errors. Show the `userId`/`threadId` (currently `userId` is fetched but never displayed). Add copy-to-clipboard for `threadId`/`traceId` and a deep link (`/admin?tab=traces&trace={id}`) that opens the drawer on load (ties into A-4).
- Acceptance: clicking a trace shows its full detail; deep link opens it; errors within the trace are visually distinct.

---
**F-6 · P2 · Time-window controls + trend sparklines for Health**
- Expose the `?hours` window (buttons: 1h / 24h / 7d / 30d) — the API already validates 1–720. Add lightweight sparklines/trend for the key SLIs by having the service return a small bucketed time series (e.g. hourly success rate) alongside the current snapshot; render with an existing chart lib (repo already ships `d3` for the explorer — check `apps/web` deps before adding anything). If adding a time series is too large, at minimum ship the window selector and a "last N refreshes" in-memory client sparkline.
- Acceptance: window switch re-queries; at least the window selector ships; no unnecessary new heavy dependency.

---
**F-7 · P3 · Global admin conveniences**
- Add: a global "last updated / refresh all" affordance; per-tab manual refresh consistency (some tabs have Refresh, some don't); export-to-CSV on the data tables (users, cron, telemetry, traces, audit); relative timestamps with an absolute-time tooltip (`title`) everywhere `new Date(...).toLocaleString()` is used; and a compact density toggle for tables. Keep these small and consistent with existing UI primitives.
- Acceptance: every data tab has a consistent refresh + export; timestamps show relative + absolute.

### 2F. UX / polish

- **UX-3 · P2 · Responsive tables.** All four data tables (`users`, `cron`, `telemetry`, `traces`) render a raw `<table>` with no horizontal-scroll wrapper. On narrow panels they overflow. Wrap each in a `.table-wrapper` (overflow-x: auto) or switch to stacked cards below `sm:`. Ensure `whitespace` and `truncate` on long `threadId`/`tool` cells with a `title` tooltip.
- **UX-4 · P3 · Empty vs. error vs. loading states are inconsistent.** Some tabs use `EmptyState`, some plain `<p>`. Standardize on `EmptyState` (bare) for empty, `SkeletonCard` for loading, and the shared error block from B-6.
- **UX-5 · P3 · Numeric formatting.** Telemetry `ms` and health percentages should use consistent `tabular-nums` and thousands separators; show `ms` as `1.2s` when ≥1000ms. Success rates already round to 2 dp — keep consistent.
- **UX-6 · P3 · Feature-flag & role badges.** Give the role/onboarding/status badges a single shared `<Badge tone="success|warn|danger|neutral">` component instead of repeating the `cn(...)` pill markup in every table.
- **UX-7 · P3 · Loading skeleton parity.** `page.tsx` `TabFallback` is a generic 8-line skeleton; consider per-tab skeletons that match each table's shape for less layout shift.
- **UX-8 · P3 · "Refresh" affordance parity.** Health has an animated refresh button; cron/users/telemetry/traces only refresh on mount or error. Add a consistent header-level refresh to every data tab (ties into B-6's shared hook exposing `reload`).

---

## 3. Suggested implementation order (dependency-aware)

1. **S-6** (add `withAdminAuth` params variant) — unblocks S-1/S-2 param routes and removes duplicated auth.
2. **S-1** (lock down test-email/test-telegram) — highest-risk security fix.
3. **A-1 / A-2 / A-3** (centralize DTOs, extract health service) — foundation the rest builds on.
4. **B-1 / B-2** (health query correctness + concurrency) — cheap, high-value.
5. **B-6** (shared admin-resource hook + error/requestId util) — then refactor all tabs onto it (removes duplication before adding features).
6. **B-5** (users pagination/search/sort) + **S-2** (role management + audit table/helper).
7. **A-4** (URL-synced tabs) → enables deep links used by F-5.
8. **UX-1 / UX-2** (a11y tabs + live regions).
9. **F-5** (trace drill-down), **F-3** (onboarding inspector), **B-4** (visibility-aware refresh + window), **F-6** (window/trends).
10. **F-1 / F-2** (impersonate + flush UI, dev-only) and **S-5** (honest flush results).
11. **F-4** (audit tab), **B-7** (log viewer upgrade), **B-8** (feature-flag UX), **S-3 / S-4**.
12. **UX-3…UX-8** polish pass last.

Ship in small, reviewable commits grouped by finding ID (put the ID in the commit message, matching the repo's `PR-XX` / `H-X` labeling convention). Add a changeset (`.changeset/`) describing the admin overhaul.

---

## 4. Global acceptance criteria (definition of done)

- `pnpm typecheck && pnpm lint && pnpm --filter @hamafx/web test -- --run && pnpm --filter @hamafx/web build` all pass.
- No admin route uses `withAuth`; every admin route is `withAdminAuth` (or its params variant). `grep -rn "withAuth\b" apps/web/src/app/api/admin` → empty.
- No admin route inlines the 401/403 auth envelope.
- Every non-deprecated admin API endpoint is reachable from the UI (or removed with a note).
- All privileged mutations write an `admin_audit_log` row.
- No secret values are ever returned or rendered (only names/booleans).
- New DB migrations are idempotent and pass the apply-twice CI check; `migrate:status` is clean.
- No new heavyweight dependency added without checking existing deps first (d3 already present for the explorer; sonner/tabler already present).
- Design tokens only — no hardcoded colors; full dark-mode parity; responsive from the ~400px panel min upward.
- a11y: axe/Playwright checks pass for `/admin`; tabs follow the ARIA Tabs pattern with keyboard nav.
- Behavior is correct in BOTH single-user and multi-user deployment modes; dev-only tools stay gated (`NODE_ENV`, `ENABLE_IMPERSONATION`, `ENABLE_LOG_STREAM`).
- Every new/changed route, service, and non-trivial component has Vitest coverage in `apps/web/test/admin/` (and a service unit test for `admin-health`). Consider a Playwright E2E that logs in as admin, visits each tab, and asserts it renders.

---

## 5. Guardrails — do NOT

- Do **not** weaken any existing `NODE_ENV`/env gate, the CSP nonce scheme, or the single-user "earliest user is admin" security property.
- Do **not** expose BYOK/API-key values, tokens, or secrets to the client — names/booleans only.
- Do **not** introduce a client-readable admin check as the only gate — server `withAdminAuth` remains authoritative; client capability flags are for UX affordance only.
- Do **not** rename the artifact filenames of the architecture explorer or change its middleware exemption without updating `middleware.ts` and `predeploy-migrate.mjs`.
- Do **not** convert server components to client components unnecessarily (`layout.tsx` must stay a server component doing the redirect).
- Do **not** add non-idempotent migrations.

---

## 6. Reference: exact files to touch (checklist)

Routes: `api/admin/{test-alert-email,test-telegram,impersonate,flush,health-slo,architecture-explorer,logs/stream}/route.ts`, `api/admin/diagnostics/trace/[id]/route.ts`, `api/admin/users/route.ts` (+ new `users/[id]/role/route.ts`, new `audit/route.ts`).
Lib: `lib/admin-auth.ts` (params variant, S-3 atomic query, `recordAdminAudit`), `lib/services/admin.ts` (DTOs, role service, feature metadata), new `lib/services/admin-health.ts`, shared DTO/types module, new `lib/hooks/use-admin-resource.ts`, `toastApiError` util.
Components: all of `admin/_components/*.tsx`, `admin/page.tsx` (ARIA tabs + URL sync), new trace-detail drawer, new impersonate/flush/audit panels, shared `Badge` + table-wrapper.
DB (`packages/db`): `updateUserRole`, `countAdmins`, optional users `q` filter on `listUsersWithSettings`, `admin_audit_log` table + helpers + idempotent migration, optional feature-flag `label`/`description` columns.
Tests: extend `apps/web/test/admin/*`; add health-service, role, audit, and test-email/telegram-auth tests; optional Playwright admin smoke.
Changeset: add one under `.changeset/`.

---

*End of brief. Everything above was derived from a full read of the admin source on `main`. When a fix requires a helper that may already exist (rate limiter, tabs primitive, tokenVersion sign-out), search the repo first and reuse it rather than adding a parallel implementation.*
