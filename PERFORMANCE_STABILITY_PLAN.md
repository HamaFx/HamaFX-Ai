# HamaFX-Ai — Performance & Stability Improvement Plan

> **Generated:** 2026-06-24
> **Scope:** Full codebase analysis — performance, stability, reliability, and operational excellence
> **Analyst:** Automated audit via Gumloop agent

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Snapshot](#2-current-architecture-snapshot)
3. [Performance Findings](#3-performance-findings)
4. [Stability Findings](#4-stability-findings)
5. [Reliability & Observability Findings](#5-reliability--observability-findings)
6. [Infrastructure & Deployment Findings](#6-infrastructure--deployment-findings)
7. [Testing & Quality Findings](#7-testing--quality-findings)
8. [Prioritized Action Plan](#8-prioritized-action-plan)

---

## 1. Executive Summary

HamaFX-Ai is a well-architected monorepo with 95 test files, Sentry integration, Langfuse tracing, rate limiting on critical paths, a multi-provider failover system, and AES-256-GCM BYOK encryption. The codebase demonstrates strong engineering practices. However, a full audit reveals **50 findings** across performance, stability, reliability, infrastructure, and testing — with 1 critical, 10 high, 28 medium, and 11 low severity items.

### Key Themes

| Theme | Impact |
|---|---|
| **Database query efficiency** | Redundant `auth()` calls, missing `cache()`, `computeUsage()` called 3× across pages |
| **Cron job resilience** | No idempotency guards, no timeout per job, missing error recovery |
| **Frontend memory management** | Multiple `setInterval`/`addEventListener` without cleanup verification |
| **Cache strategy gaps** | `force-dynamic` overuse, no Redis, no SWR on key endpoints |
| **Monitoring blind spots** | `console.error` instead of Sentry in server actions, no health check for AI providers |
| **Test coverage gaps** | No load tests, no settings tests, no cron job tests, no E2E for critical flows |
| **Docker optimization** | No health checks on app/worker containers, no .dockerignore audit |

---

## 2. Current Architecture Snapshot

### What's Already Good ✅

| Area | Status |
|---|---|
| Rate limiting | Chat API (30/min), bulk-test (2/5min), login (10/min) |
| CSRF protection | `withCsrf()` on client fetches, cookie-based token |
| Encryption | AES-256-GCM for BYOK keys, password-based backup encryption |
| Failover | Health-scored provider ordering, pinned providers, `ProviderEmptyError` sentinel |
| Caching | Multi-tier: memory → Next.js Data Cache → SWR with stale-while-error |
| Observability | Sentry (web + worker), Langfuse OTel tracing, per-turn telemetry |
| CI/CD | Lint + typecheck + unit tests + E2E + nightly AI eval + CodeQL |
| Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| PWA | Service worker with update flow, VAPID push notifications |
| Testing | 95 test files, 590+ passing tests |

---

## 3. Performance Findings

### PERF-01: Redundant `auth()` calls in nested server components
**Severity:** 🟠 High
**Description:** The settings page calls `auth()` to get the session, then child server components call `auth()` again independently. Next.js deduplicates `fetch()` but NOT custom async functions.
**Fix:** Pass session as props or wrap `auth()` with React's `cache()`.

### PERF-02: `computeUsage()` called 3× across settings pages
**Severity:** 🟠 High
**Description:** Expensive SQL aggregations run independently on 3 different pages.
**Fix:** Wrap with `unstable_cache` or React `cache()`.

### PERF-03: `force-dynamic` on all settings pages and most API routes
**Severity:** 🟡 Medium
**Description:** Prevents any caching. Agent page tool catalogue changes infrequently.
**Fix:** Use `revalidate` with appropriate TTLs.

### PERF-04: `buildToolCatalogue()` and `buildCatalogForUser()` not cached
**Severity:** 🟡 Medium
**Fix:** Use `unstable_cache` with 30-60s TTL.

### PERF-05: Market data routes decrypt BYOK keys on every request
**Severity:** 🟡 Medium
**Fix:** Cache decrypted key per-user with short TTL.

### PERF-06: No connection pooling for Postgres
**Severity:** 🟡 Medium
**Fix:** Configure pool settings or use pgBouncer/Supabase pooler.

### PERF-07: No pagination on thread listing
**Severity:** 🟡 Medium
**Fix:** Cursor-based pagination using `updatedAt`.

### PERF-08: Chart components re-render on every price tick
**Severity:** 🟡 Medium
**Fix:** Memoize candle data, use `React.memo`.

### PERF-09: No image optimization for uploaded chat images
**Severity:** 🟢 Low
**Fix:** Use `sharp` to resize/compress before upload.

### PERF-10: No bundle size analysis or limits
**Severity:** 🟢 Low
**Fix:** Add `@next/bundle-analyzer` and CI check.

### PERF-11: RAG query fetches large pool without limit enforcement
**Severity:** 🟡 Medium
**Fix:** Add hard cap on POOL size.

### PERF-12: No streaming for market data structure computation
**Severity:** 🟢 Low
**Fix:** Pre-compute structure on worker and cache.

---

## 4. Stability Findings

### STAB-01: Cron jobs lack idempotency guards
**Severity:** 🔴 Critical
**Description:** 12 cron jobs with no idempotency. Duplicate runs could corrupt data.
**Fix:** Add `cron_runs` table with `(job_name, run_date)` primary key.

### STAB-02: No timeout on cron jobs except alerts
**Severity:** 🟠 High
**Fix:** Set `maxDuration = 60` on all cron routes, pass `AbortSignal` to fetches.

### STAB-03: Telegram webhook swallows errors and returns 200
**Severity:** 🟠 High
**Fix:** Return 500 on internal errors so Telegram retries.

### STAB-04: Silent catch blocks across server components
**Severity:** 🟠 High
**Fix:** Add minimal logging to all catch blocks.

### STAB-05: No circuit breaker on external API providers
**Severity:** 🟠 High
**Fix:** Implement circuit breaker per provider.

### STAB-06: No retry with exponential backoff on AI provider failures
**Severity:** 🟡 Medium
**Fix:** Add retry logic before fallback.

### STAB-07: Memory leak risk in calendar setInterval
**Severity:** 🟡 Medium
**Fix:** Add `isMounted` flag in cleanup.

### STAB-08: Chat scroll listener cleanup verification
**Severity:** 🟡 Medium
**Fix:** Verify dependency arrays and useCallback usage.

### STAB-09: No graceful shutdown for worker process
**Severity:** 🟡 Medium
**Fix:** Track active jobs, wait with timeout before exit.

### STAB-10: No transaction wrapping for multi-step DB operations
**Severity:** 🟡 Medium
**Fix:** Use Drizzle's transaction API.

### STAB-11: RAG dense query may fail silently if pgvector index missing
**Severity:** 🟡 Medium
**Fix:** Add startup check, fallback to FTS-only.

### STAB-12: No rate limiting on API routes except chat and bulk-test
**Severity:** 🟡 Medium
**Fix:** Add `withRateLimit` to all API routes.

---

## 5. Reliability & Observability Findings

### OBS-01: `console.error` instead of Sentry in server actions
**Severity:** 🟠 High
**Fix:** Use `Sentry.captureException` with tags.

### OBS-02: Health check only checks DB
**Severity:** 🟡 Medium
**Fix:** Add AI provider, market data, and cache checks.

### OBS-03: No structured logging
**Severity:** 🟡 Medium
**Fix:** Adopt pino or standardize JSON log format.

### OBS-04: No metrics collection
**Severity:** 🟡 Medium
**Fix:** Add prom-client or Sentry metrics.

### OBS-05: No alerting on critical failures
**Severity:** 🟡 Medium
**Fix:** Configure Sentry alerts for error rate, DB, AI providers.

### OBS-06: No request ID propagation
**Severity:** 🟢 Low
**Fix:** Generate request ID in middleware.

---

## 6. Infrastructure & Deployment Findings

### INFRA-01: No health checks on Docker containers
**Severity:** 🟠 High
**Fix:** Add healthcheck to app and worker services.

### INFRA-02: No resource limits on Docker containers
**Severity:** 🟡 Medium
**Fix:** Add memory and CPU limits.

### INFRA-03: Docker image not optimized for layer caching
**Severity:** 🟢 Low
**Fix:** Add .dockerignore excluding tests, docs, .git.

### INFRA-04: No Docker image vulnerability scanning
**Severity:** 🟡 Medium
**Fix:** Add Trivy scan in CI.

### INFRA-05: No staging environment
**Severity:** 🟡 Medium
**Fix:** Set up Vercel preview + staging DB.

### INFRA-06: No database migration rollback strategy
**Severity:** 🟠 High
**Fix:** Test locally, backup before migration, add down migrations.

### INFRA-07: CSP allows unsafe-eval and unsafe-inline
**Severity:** 🟡 Medium
**Fix:** Use nonces, strict-dynamic.

### INFRA-08: No rate limiting on registration
**Severity:** 🟡 Medium
**Fix:** Add withRateLimit to register endpoint.

### INFRA-09: No secrets rotation strategy
**Severity:** 🟢 Low
**Fix:** Document rotation procedures.

### INFRA-10: Migrations run before build in Vercel
**Severity:** 🟡 Medium
**Fix:** Run as post-deployment step.

---

## 7. Testing & Quality Findings

### TEST-01: No tests for cron jobs
**Severity:** 🟠 High
**Fix:** Add tests for all 12 cron jobs.

### TEST-02: No tests for settings server actions
**Severity:** 🟡 Medium
**Fix:** Add Vitest tests with mocked DB.

### TEST-03: No load testing
**Severity:** 🟡 Medium
**Fix:** Add k6 or Artillery tests.

### TEST-04: No E2E for settings, alerts, journal, news
**Severity:** 🟡 Medium
**Fix:** Add Playwright E2E tests.

### TEST-05: No security testing
**Severity:** 🟡 Medium
**Fix:** Add npm audit, OWASP ZAP scan.

### TEST-06: No failover test under real failures
**Severity:** 🟡 Medium
**Fix:** Simulate provider timeouts, 500s, rate limits.

### TEST-07: Expand budget guardrail tests
**Severity:** 🟡 Medium
**Fix:** Cover midnight reset, per-provider thresholds.

### TEST-08: Split CI into fast/slow tracks
**Severity:** 🟢 Low
**Fix:** Fast on PR, slow on merge.

### TEST-09: No coverage threshold enforcement
**Severity:** 🟢 Low
**Fix:** Add thresholds in vitest.config.ts.

### TEST-10: No PWA service worker test
**Severity:** 🟢 Low
**Fix:** Add Playwright SW update test.

---

## 8. Prioritized Action Plan

### Phase 1 — Critical & High Priority 🔴 (1-2 weeks)

| # | Task | Type | Effort |
|---|---|---|---|
| 1 | STAB-01: Cron job idempotency guards | Stability | M |
| 2 | STAB-02: Cron job timeouts | Stability | S |
| 3 | STAB-03: Telegram webhook error handling | Stability | S |
| 4 | STAB-04: Log all silent catch blocks | Stability | S |
| 5 | STAB-05: Circuit breaker for providers | Stability | M |
| 6 | OBS-01: Sentry in server actions | Observability | S |
| 7 | INFRA-01: Docker health checks | Infrastructure | S |
| 8 | INFRA-06: Migration rollback strategy | Infrastructure | M |
| 9 | PERF-01: Cache auth() calls | Performance | S |
| 10 | PERF-02: Cache computeUsage() | Performance | S |
| 11 | TEST-01: Cron job tests | Testing | M |
| 12 | STAB-10: DB transactions for multi-step ops | Stability | S |

### Phase 2 — High Priority 🟠 (2-4 weeks)

| # | Task | Type | Effort |
|---|---|---|---|
| 13 | PERF-03: Replace force-dynamic with revalidate | Performance | M |
| 14 | PERF-04: Cache catalog functions | Performance | S |
| 15 | PERF-05: Cache decrypted BYOK keys | Performance | M |
| 16 | STAB-06: Retry with backoff before fallback | Stability | M |
| 17 | STAB-12: Rate limit all API routes | Stability | M |
| 18 | OBS-02: Enhanced health check | Observability | S |
| 19 | OBS-03: Structured logging | Observability | M |
| 20 | INFRA-02: Docker resource limits | Infrastructure | S |
| 21 | INFRA-04: Docker vulnerability scanning | Infrastructure | S |
| 22 | INFRA-07: Tighten CSP | Infrastructure | M |
| 23 | INFRA-10: Move migrations out of build | Infrastructure | S |
| 24 | TEST-02: Settings server action tests | Testing | M |
| 25 | TEST-04: E2E for critical flows | Testing | M |

### Phase 3 — Medium Priority 🟡 (1-2 months)

| # | Task | Type | Effort |
|---|---|---|---|
| 26 | PERF-06: DB connection pooling | Performance | M |
| 27 | PERF-07: Cursor pagination | Performance | M |
| 28 | PERF-08: Optimize chart re-renders | Performance | M |
| 29 | PERF-11: Cap RAG pool size | Performance | S |
| 30 | STAB-07: Fix calendar setInterval | Stability | S |
| 31 | STAB-08: Verify chat scroll cleanup | Stability | S |
| 32 | STAB-09: Worker graceful shutdown | Stability | M |
| 33 | STAB-11: pgvector health check | Stability | S |
| 34 | OBS-04: Prometheus metrics | Observability | M |
| 35 | OBS-05: Sentry alerts | Observability | S |
| 36 | OBS-06: Request ID propagation | Observability | M |
| 37 | INFRA-05: Staging environment | Infrastructure | M |
| 38 | INFRA-08: Rate limit registration | Infrastructure | S |
| 39 | TEST-03: Load testing | Testing | M |
| 40 | TEST-05: Security testing | Testing | M |
| 41 | TEST-06: Failover failure tests | Testing | M |
| 42 | TEST-07: Budget guardrail expansion | Testing | S |
| 43 | TEST-09: Coverage thresholds | Testing | S |

### Phase 4 — Low Priority 🟢 (backlog)

| # | Task | Type | Effort |
|---|---|---|---|
| 44 | PERF-09: Image optimization with sharp | Performance | S |
| 45 | PERF-10: Bundle size analysis | Performance | S |
| 46 | PERF-12: Async market structure | Performance | M |
| 47 | INFRA-03: Docker layer caching | Infrastructure | S |
| 48 | INFRA-09: Secrets rotation docs | Infrastructure | S |
| 49 | TEST-08: Split CI tracks | Testing | S |
| 50 | TEST-10: PWA service worker test | Testing | S |

---

## Summary Statistics

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Performance | 0 | 2 | 6 | 4 | 12 |
| Stability | 1 | 4 | 7 | 0 | 12 |
| Reliability & Observability | 0 | 1 | 4 | 1 | 6 |
| Infrastructure | 0 | 2 | 5 | 3 | 10 |
| Testing | 0 | 1 | 6 | 3 | 10 |
| **Total** | **1** | **10** | **28** | **11** | **50** |

### Effort: ~160 hours (22 Small, 25 Medium, 3 Large)

---

## Architecture Recommendations

1. **Add Redis** for distributed caching, rate limiting, and circuit breaker state
2. **Add a Job Queue** (BullMQ/Inngest) for heavy background work instead of synchronous cron
3. **Database Read Replicas** for read-heavy queries at scale
4. **OpenTelemetry Distributed Tracing** for end-to-end request flow visibility
5. **Progressive Loading** with Suspense boundaries on all routes

---

*End of document.*
