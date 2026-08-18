# Kestrel — Full Project Audit

**Audit date:** 2026-08-18  
**Scope:** Architecture, frameworks, dependencies, web application, AI runtime, data layer, database, worker, security, frontend, testing, CI/CD, deployment, observability, and documentation.

## Executive conclusion

Kestrel is not fundamentally built with the wrong frameworks. The core stack is modern and reasonable:

- Next.js 16 + React 19
- Tailwind CSS v4
- Drizzle ORM + PostgreSQL
- PGlite for local development
- Vercel AI SDK v5
- TanStack Query
- Vitest + Playwright
- Node.js worker for market feeds and scheduled jobs

The main issue is not framework selection. It is accumulated scope and duplicated infrastructure. The repository currently behaves like several products combined into one:

- Single-user OSS application
- Planned multi-tenant SaaS
- BYOK AI platform
- Multi-agent committee system
- Background job system
- Billing product
- Evaluation and training pipeline
- Langfuse/Sentry/OpenTelemetry observability stack
- Vercel cron, VM timers, and worker scheduling
- Redis and in-memory caching
- TradingView charts and local chart infrastructure
- Legacy HamaFX compatibility layer

The project is technically strong and heavily tested, but it needs a clearer supported-product boundary and removal of dormant or overlapping systems.

---

## Validation results

| Check | Result |
|---|---|
| Typecheck | Passed |
| Lint | Passed with 52 warnings |
| Unit/integration tests | Passed; all 14 Turbo tasks successful |
| AI tests | 111 files, 1,166 tests passed |
| Web tests | 96 files, 943 tests passed |
| Database tests | 22 files, 166 tests passed |
| Production web build | Failed during `/news` prerender |
| Bundle-size guard | Could not run because build artifacts were unavailable |
| Knip dependency analysis | Failed with one unlisted dependency and unresolved test imports |

The test suite is a major strength. The primary failures identified during the audit are build/configuration and architecture issues rather than broad code instability.

---

# Highest-priority findings

## P0 — Production build is not reproducible

### Evidence

`apps/web/src/app/(app)/news/page.tsx` uses:

```ts
export const revalidate = 300;
```

and performs a database query during page generation:

```ts
const articles = await listRecentArticles(120);
```

The production build attempted to prerender `/news` and failed because the database connection rejected the current certificate:

```text
Error occurred prerendering page "/news"
self-signed certificate in certificate chain
```

The build compiled successfully and passed TypeScript, so this is specifically a runtime/build data-fetching problem.

### Why this matters

A production build should not unexpectedly require a working database connection or external TLS configuration unless that is explicitly intended.

### Recommendation

Choose one strategy:

1. Make `/news` explicitly dynamic, similar to `/calendar`:

   ```ts
   export const dynamic = 'force-dynamic';
   ```

2. Remove the server-side database fetch and load data exclusively through `/api/news`.
3. Provide an isolated build database with valid certificates.

Option 1 is the safest short-term fix.

Also make production builds use a clean, explicit environment rather than silently inheriting local `.env` files.

---

## P0 — Production legacy-auth configuration only warns during build

The build emitted:

```text
[SECURITY] AUTH_MODE=legacy is set in production! Authentication is disabled.
```

`auth.config.ts` rejects legacy auth when a request reaches the proxy, but `env.ts` only logs a warning during startup.

### Why this matters

A production artifact should never be created while a setting exists that disables authentication. This should fail immediately during build/startup, not wait until the first request.

### Recommendation

Make production validation fail closed:

- Reject `AUTH_MODE=legacy` during production build.
- Reject it during application startup.
- Keep legacy mode available only under an explicit development environment.

The repository still contains many old references to `hfx_auth`, `HAMAFX_*`, `.hamafx`, and `__system__`.

---

## P1 — News and calendar “Refresh” buttons are probably broken

The UI calls:

```text
/api/cron/news
/api/cron/calendar
```

from browser components.

The cron helper supports:

1. Bearer `CRON_SECRET`
2. A legacy `hfx_auth` cookie

The current authentication system uses Auth.js cookies such as:

```text
authjs.session-token
__Secure-authjs.session-token
```

The current UI does not have the legacy `hfx_auth` cookie.

The comments in `lib/cron.ts` claim browser session authentication is supported, but the implementation does not use the current Auth.js session.

### Impact

Manual refresh controls can return 401 even for logged-in users.

### Recommendation

Split the two concepts:

- Scheduler requests: `Authorization: Bearer CRON_SECRET`
- Browser manual refresh: authenticated Auth.js session plus admin/operator authorization

Do not revive the legacy cookie. Replace the browser branch with `auth()` and explicitly authorize the user before running an expensive provider job.

---

## P1 — Chat image uploads are publicly accessible

`apps/web/src/lib/storage.ts` uploads images to a public Supabase Storage bucket and returns a public URL. The source comments explicitly state that the bucket must be public.

### Why this matters

Chat images can contain:

- Screenshots
- Trading account information
- Personal documents
- API or broker details
- Private analysis context

Anyone who obtains the URL may access the image.

### Recommendation

Use a private bucket and short-lived signed URLs:

- Store objects under a user-scoped path.
- Generate signed URLs only when needed.
- Expire URLs quickly.
- Delete abandoned uploads with a worker cleanup job.
- Avoid exposing long-lived public URLs to the model or browser.

This is a privacy issue, not only an implementation preference.

---

## P1 — Multi-tenancy is architecturally contradictory

The repository identity and some code describe Kestrel as multi-tenant production software. The security documentation says:

```text
MULTI_USER_ENABLED=1 is rejected
KESTREL_ENABLE_RLS=1 is rejected
shared multi-user mode is not supported
```

At the same time, the code contains:

- Tenant columns
- RLS migrations
- Tenant triggers
- Admin database access
- Tenant-scoped caches
- Multi-user migration tests
- Multi-user isolation E2E tests

### Problem

There are effectively two products:

1. A single-user self-hosted BYOK application
2. A partially implemented multi-tenant SaaS application

This increases complexity and makes it difficult to know which guarantees are actually supported.

### Recommendation

Make a firm product decision.

#### If single-user is the real product

Remove or quarantine:

- Runtime tenant routing
- RLS configuration
- Admin database connection complexity
- Tenant cache logic
- Multi-user deployment documentation
- Unused tenant migration compatibility paths

Keep explicit `userId` scoping, but state clearly that the product is single-user.

#### If multi-tenant SaaS is the target

Finish the work before exposing the mode:

- Every query must establish tenant context.
- Every route needs tenant authorization.
- Every cache key must be tenant-safe.
- Every worker job must carry tenant identity.
- RLS must be enabled in staging and tested with real database roles.
- Browser and worker E2E tests must cover cross-tenant access.

Do not advertise the current implementation as production multi-tenancy.

---

# Significant over-engineering

## 1. AI transport has three protocols

`apps/web/src/lib/chat-transport.ts` supports:

1. Native AI SDK data streams
2. Legacy multi-agent SSE
3. Full-mode background jobs converted into synthetic streams

Every AI streaming change must therefore account for multiple protocols, progress formats, terminal states, and error paths.

### Recommendation

Standardize on one protocol:

- Use AI SDK v5 data streams for normal and multi-agent responses.
- Represent background jobs as a standard job resource with progress polling.
- Remove the legacy SSE adapter after existing clients are migrated.

This would remove a large amount of custom protocol code and reduce stream bugs.

## 2. Too many AI layers for the current product

The AI package includes:

- Domain routing
- Multiple provider adapters
- BYOK
- Planner
- Verification
- Citation enforcement
- Memory
- RAG
- Embeddings
- Multi-agent committee
- Full-mode job queue
- Cost estimation
- Budget guards
- Langfuse
- Evaluation datasets
- Training exports
- Feedback review
- Telegram integration
- Portfolio risk tools
- 33 registered tools

Each feature is defensible in isolation, but collectively this is a very large platform.

### Recommendation

Use telemetry to classify features as:

- Core and actively used
- Useful but low adoption
- Dormant
- Experimental
- Compatibility-only

Then remove or isolate dormant systems. The primary product promise appears to be AI market intelligence for XAUUSD and selected instruments; the codebase currently supports a much broader AI platform than that promise requires.

## 3. Multiple schedulers exist

The repository contains:

- Worker-internal `node-cron`
- Vercel cron routes
- GCE/systemd timers that call Vercel routes
- Database cron locks
- Worker job runners
- Docker backup scheduling

Some of this is intentional, but job ownership is difficult to understand.

### Risk

The same job can be triggered twice, retried by two systems, locked differently, observed in different telemetry paths, or executed with different environment variables.

### Recommendation

Define one owner for each job category:

| Job | Recommended owner |
|---|---|
| Live ticks and candle aggregation | Worker |
| Heavy AI analysis | Worker queue |
| Lightweight HTTP maintenance | One external scheduler |
| Database backups | Backup container or managed database |
| Health alert delivery | One scheduler only |

Keep database idempotency as protection, not as the primary scheduling design.

## 4. Redis implementation is more complex than necessary

`packages/data/src/cache` supports:

- Per-tenant memory caches
- Redis caches
- LRU tenant eviction
- SWR metadata
- Tag indexes
- Lazy connection
- Best-effort invalidation

Each tenant can receive a separate `RedisCache` object and potentially a separate Redis client connection. At the 500-tenant cap, this could become hundreds of Redis connections in one process.

The Redis implementation also does not use Redis expiration commands. Expired keys are removed lazily, so unused keys can remain indefinitely.

### Recommendation

Either:

- Remove Redis for the single-user deployment, or
- Use one shared Redis client with tenant-prefixed keys, native `EXPIRE`, and a simple cache abstraction.

Do not create one Redis TCP client per tenant.

---

# Frontend findings

## 1. Custom chart-fetching infrastructure appears unused

Search results found only definitions for:

- `useCandles`
- `useChartData`
- `fetchChartData`

The actual chart route renders a TradingView widget:

```tsx
<TradingViewWidget symbol={symbol} tf={tf} theme="dark" />
```

The custom candle/indicator path is not used by the route.

### Recommendation

Choose one direction.

#### Option A — Keep TradingView

Delete or quarantine the unused custom chart data path and indicator endpoint.

#### Option B — Own the chart experience

Use the existing local data APIs and lightweight-charts to render candles, indicators, market overlays, and Kestrel-specific annotations.

The current hybrid maintains both systems without combining their benefits.

## 2. TradingView introduces an external runtime dependency

The chart injects:

```text
https://s3.tradingview.com/tv.js
```

This requires CSP exceptions, third-party script availability, data-term review, and runtime fallback behavior. Decide whether the chart is a core product surface or an optional external widget.

## 3. Local bookmarks are not user-scoped

News bookmarks are saved in browser local storage:

```ts
const STORAGE_KEY = 'kestrel:news:bookmarks';
```

Multiple users sharing one browser profile can see the same bookmarks. Bookmarks also disappear when local storage is cleared.

### Recommendation

Either document bookmarks as device-local or store them server-side under `userId`. Server-side storage is preferable if multi-user support remains a target.

## 4. Test noise hides real failures

Tests pass, but output includes expected-looking error logs for:

- Encryption authentication failures
- Missing B2 configuration
- Provider failover
- Missing canvas implementation in jsdom
- Missing optional services

For example:

```text
Not implemented: HTMLCanvasElement.prototype.getContext
```

### Recommendation

- Mock `HTMLCanvasElement.getContext` in the relevant test setup.
- Assert expected error logging instead of printing full error stacks.
- Use a test logger that captures structured logs silently.
- Keep optional-service warnings explicit but less noisy.

---

# Dependency and framework review

## Keep these

There is no strong reason to replace:

- Next.js
- React
- Tailwind
- Drizzle
- PostgreSQL
- PGlite
- TanStack Query
- Vitest
- Playwright
- Vercel AI SDK
- `motion`
- `nuqs`
- `dnd-kit`
- `react-virtual`

The dependency search confirmed that the major UI libraries are mostly used.

## Review these

### `@ai-sdk/provider-utils`

Knip identified it as an unlisted dependency:

```text
Unlisted dependencies (1)
@ai-sdk/provider-utils
```

It is directly imported by `packages/ai/src/_providers/helpers.ts`. Add it as a direct dependency or avoid importing its type from a package not declared in `package.json`.

### `next-view-transitions`

It is used widely, so it is not unused. Keep it only if its transition behavior is visibly important. Otherwise standard Next links simplify the application.

### Sentry, Langfuse, and OpenTelemetry

All are defensible, but the observability stack is broad. Define a clear policy:

- Sentry for operational errors
- Langfuse for AI traces/evaluation
- OpenTelemetry only where vendor-neutral tracing is actually consumed

Avoid recording the same AI event through several telemetry paths.

---

# Database and migration review

The migration discipline is better than average:

- Migration tests exist.
- Idempotency is tested.
- Schema drift is tested.
- Direct connection rules are documented.
- Applied migrations are protected from editing.

The main issue is accumulated historical complexity:

- 79 migrations
- Tenant foundation migrations
- RLS cutover and rollback-style migrations
- Legacy names
- Compatibility aliases
- Billing safety gates
- Multiple environment modes

Do not rewrite applied migrations. Instead:

1. Freeze the existing migration history.
2. Remove dead runtime compatibility code.
3. Add a clean current-architecture document.
4. Use future migrations only for actual changes.
5. Consider a documented schema baseline for new installations if migration startup becomes slow.

The PGlite migration test suite should be retained.

---

# CI/CD and operations

## Strengths

- Frozen lockfile installs
- Typecheck and lint gates
- Build gate
- Dependency audit
- Trivy image scans
- CodeQL
- Playwright sharding
- Database migration tests
- Backup/restore smoke workflow
- Nightly AI evaluation
- Load testing with k6

## Problems

### CI duplicates expensive work

`ci-fast.yml` runs a regular build and then another build with:

```bash
ANALYZE=true pnpm --filter @kestrel/web build
```

This can significantly increase PR time.

Recommendation: make bundle analysis manual or run it only when relevant frontend files change.

### Knip currently fails

Knip reports:

- One actual unlisted dependency
- Several unresolved setup-script imports
- Unused setup exports
- Configuration hints

Either fix the baseline or remove Knip from the standard audit until the configuration accurately understands the repository.

### E2E configuration was not fully verified

The Playwright configuration is thoughtful and starts its own server. However, the normal E2E suite was not run during this audit because the production build/environment currently fails. Rerun E2E after fixing the build issue.

### Docker and Vercel assumptions differ

Docker explicitly sets:

```bash
AUTH_MODE=normal
```

The local build does not. Docker also uses different database TLS assumptions. Environment behavior should be standardized so local production builds, Docker, and Vercel exercise the same security invariants.

---

# Documentation quality

The documentation is extensive but stale and contradictory in places.

Examples:

- `docs/09-testing.md` reports old test counts that do not match the current suite.
- Some evaluation documentation still references `hfx_auth`, while current docs and tests use Auth.js session cookies.
- The project identity describes multi-tenancy as shipped, while the security documentation says it is disabled and unsupported.
- Many source files contain `Phase`, `P0`, `P1`, `P2`, `H-*`, and audit-history comments that make current behavior harder to recognize.
- Legacy names remain in user-facing scripts and compatibility logic.

### Recommendation

Create one authoritative current-architecture document containing:

- Supported deployment modes
- Supported authentication mode
- Actual tenant guarantees
- Current job ownership
- Current chart implementation
- Current AI transport
- Supported external services
- Current test commands

Move historical audit notes into an archive. Remove phase labels from normal production code once the associated change is complete.

---

# Recommended roadmap

## Phase 1 — Release correctness

1. Fix `/news` build-time database prerendering.
2. Fail the build when `AUTH_MODE=legacy` is set in production.
3. Fix browser refresh authorization using Auth.js sessions.
4. Run the production build from a clean environment.
5. Run the real Playwright suite.
6. Fix noisy canvas/test logging.
7. Add `@ai-sdk/provider-utils` directly.

## Phase 2 — Security and data privacy

1. Make chat image storage private.
2. Use signed URLs.
3. Replace legacy `hfx_auth` references.
4. Separate share-token signing from old auth-cookie naming.
5. Decide whether multi-tenancy is supported or only planned.
6. Add explicit cross-user tests for every user-owned resource.

## Phase 3 — Simplification

1. Remove unused custom chart data hooks or finish the local chart.
2. Choose one chart system.
3. Choose one AI streaming protocol.
4. Choose one scheduler owner per job.
5. Simplify Redis to one shared client or remove it from single-user deployments.
6. Remove obsolete HamaFX compatibility aliases after a documented migration window.

## Phase 4 — Product scope reduction

1. Measure actual usage of all 33 tools.
2. Identify unused agents and integrations.
3. Move experimental training/evaluation features into a separate package or feature boundary.
4. Keep the production runtime focused on market data, chat, core analysis, alerts, journal, portfolio risk, and essential observability.

---

# Final assessment

| Area | Assessment |
|---|---|
| Technical quality | Good |
| Security intent | Strong, but complicated by legacy paths |
| Test quality | Strong |
| Production readiness | Blocked by build reproducibility and runtime mismatches |
| Maintainability | Below average because of accumulated modes and compatibility layers |
| Framework choices | Mostly appropriate; wholesale replacement is not recommended |
| Main risk | Scope and duplicated infrastructure, not TypeScript or framework quality |

The best next move is not to rewrite Kestrel. Make the supported product boundary explicit, fix the build/auth/storage issues, then remove dormant infrastructure aggressively.
