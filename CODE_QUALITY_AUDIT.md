# HamaFX-Ai — Code Quality & Architecture Audit

**Date**: July 18, 2026  
**Scope**: Entire monorepo (`apps/web`, `apps/worker`, `packages/*`)  
**Methodology**: Static analysis, complexity scanning, pattern detection, architectural review

---

## Executive Summary

HamaFX-Ai is a mature, well-structured open-source trading copilot platform spanning ~130K lines of TypeScript across 8 packages. The architecture demonstrates sophisticated domain-driven design with clear package boundaries, consistent coding conventions, and strong typing (TypeScript strict mode). The codebase exhibits many hallmarks of professional engineering: comprehensive error handling with standardized error codes, structured logging with pino, diagnostic tracing with OpenTelemetry/Langfuse, and defense-in-depth security patterns.

**Overall Grade: B+/A-**

The codebase is production-grade and maintainable, but has several areas of accumulated technical debt that warrant attention. The three most significant concerns are: (1) several oversized monolith files exceeding 800+ lines, (2) widespread `as` type casts and `eslint-disable` comments that weaken TypeScript safety, and (3) ~60 remaining `console.*` calls in production paths that should be migrated to the structured logger.

---

## 1. Architecture & Structure

### 1.1 Monorepo Layout — ✅ Excellent

The monorepo follows a clean domain-driven structure:

```
HamaFX-Ai/
├── apps/
│   ├── web/              # Next.js 15 PWA (frontend + API routes)
│   └── worker/           # Node.js daemon (SignalR, tick processing, jobs)
├── packages/
│   ├── ai/               # AI agent core (chat, 32 tools, routing, memory)
│   ├── data/             # Market data adapters (price, candles, news, failover)
│   ├── db/               # Drizzle ORM (50 tables, Postgres/PGlite)
│   ├── indicators/       # Technical indicators (SMA, EMA, RSI, MACD, SMC)
│   ├── shared/           # Zod schemas, domain types, env validation, errors
│   ├── config/           # Shared ESLint, Prettier, TS configs
│   └── test-utils/       # Shared test factories, mocks, vitest helpers
```

**Dependency chain** is well-defined: `config` → `shared` → `db` + `indicators` → `data` → `ai` → `web` + `worker`

| Rating | Observation |
|--------|------------|
| ✅ | Clear separation of concerns between packages |
| ✅ | No circular dependencies detected |
| ✅ | Each package has its own `tsconfig.json`, `eslint.config.js`, `vitest.config.ts` |
| ✅ | Public APIs controlled via barrel files (`index.ts`) |
| ✅ | Turborepo v2 for build orchestration with proper task dependencies |

### 1.2 Documentation Quality — ✅ Good

- `AGENTS.md` is excellent: comprehensive, well-maintained, and serves as the canonical source of truth
- 20+ markdown docs covering architecture, security, testing, deployment, API routes
- Code comments are generally thorough and explain *why*, not just *what*
- Phase/feature tracking in barrel files and schema comments connects code to requirements

### 1.3 Naming Conventions — ✅ Consistent

- `kebab-case.ts` for modules, `PascalCase` for React components
- `_prefix.ts` for private/internal modules
- Consistent test naming (`*.test.ts`) and route naming (`route.ts`)
- Tool files named consistently (all 32 tools follow the same pattern)

---

## 2. Code Quality Deep-Dive

### 2.1 TypeScript Safety — ⚠️ Good but Weakening

**Statistics**:
- Strict mode enabled project-wide + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`
- **166 `any` type usages** found in production source files
- **49 `eslint-disable` comments** (many `@typescript-eslint/no-explicit-any`)
- **197 `throw new Error(...)` calls** — good use of custom error classes but inconsistent

**Key concerns**:

| File | Issue | Count |
|------|-------|-------|
| `apps/web/src/components/chart/chart-canvas.tsx` | `as any` casts for lightweight-charts library | 10+ |
| `packages/ai/src/tools/convene-committee.ts` | File-level `eslint-disable` for `no-explicit-any` | 1 (file-level) |
| `packages/ai/src/tools/with-telemetry.ts` | Multiple `any` in generic wrapper | 7 |
| `apps/web/src/components/chart/performance-chart.tsx` | File-level `eslint-disable` for `no-explicit-any` | 1 (file-level) |
| `apps/web/src/auth.ts` | `any` annotations for NextAuth v5 compatibility | 4 |
| `apps/web/src/middleware.ts` | `any` annotation on middleware return type | 1 |

**Recommendation**: The `any` usage falls into two categories — library compatibility (legitimate) and laziness (fixable). The chart components' `any` casting is a known trade-off with `lightweight-charts` v5 typing. However, `with-telemetry.ts` and `convene-committee.ts` should be refactored to use proper generics instead of blanket `any` types.

### 2.2 Error Handling — ✅ Strong but Inconsistent

**Strengths**:
- `AppError` class hierarchy in `packages/shared/src/errors.ts` with standardized error codes
- `ProviderError` and `ProviderEmptyError` in the data layer
- Centralized `formatErrorResponse()` for API error envelopes
- `errorResponse()` helper in `apps/web/src/lib/api.ts` with Sentry integration
- `logErrorContext()` in the shared logger auto-enriches with error patterns, stack traces, and trace IDs

**Weaknesses**:
- **60+ `console.warn`/`console.error` calls** in production paths (should use structured logger)
- Some files use `throw new Error(...)` instead of `AppError` subclasses
- Comments reference "OBS-09 (Phase 5.3): Use pino logger instead of console.error" in several places, indicating intentional tech debt

**Recommendation**: Prioritize the logger migration (already planned and annotated). Create a `BudgetExceededError` consistency pass — the budget exceeded error uses the custom class in `cost.ts` but `throw new Error(budgetCheck.blockedReason)` is used in `agent.ts`.

### 2.3 File Size & Complexity — ⚠️ Some Monoliths Need Decomposition

**Largest files**:

| File | Lines | Issue |
|------|-------|-------|
| `packages/ai/src/byok-providers.ts` | 1,291 | Provider factory — should split per-provider |
| `apps/web/src/app/(app)/settings/actions.ts` | 1,222 | Server actions — should split by domain |
| `packages/ai/src/model.ts` | 870 | Model resolution — overloaded with concerns |
| `packages/ai/src/agent.ts` | 848 | Core agent loop — complex but well-structured |
| `apps/web/src/components/chat/chat-screen.tsx` | 756 | Chat UX — state management could be extracted |

**Highest cyclomatic complexity** (branch density):

| File | Branches | Concern |
|------|----------|---------|
| `apps/web/src/app/(app)/settings/actions.ts` | 188 | Monolithic settings handler |
| `apps/web/src/app/(auth)/actions.ts` | 139 | Auth actions — could be split per flow |
| `packages/ai/src/model.ts` | 118 | Model resolution growing organically |
| `apps/web/src/components/chat/chat-screen.tsx` | 100 | Large component |

**Recommendation**:
1. **`byok-providers.ts`** (1,291 lines, HIGH): Split into `providers/google.ts`, `providers/openai.ts`, etc. with a shared registry
2. **`settings/actions.ts`** (1,222 lines, MEDIUM): Split into `actions/api-keys.ts`, `actions/preferences.ts`, `actions/billing.ts`, etc.
3. **`model.ts`** (870 lines, MEDIUM): Extract provider-specific resolution into separate files

### 2.4 `process.env` Direct Access — ⚠️ Pervasive but Partially Managed

**196 usages** of `process.env.*` detected across production source files.

**Patterns observed**:
- Env parsing is centralized in `packages/shared/src/env.ts` (Zod-validated `ServerEnv`)
- But many files access `process.env` directly for runtime flags (bypassing the central schema)
- Worker has its own `env.ts` with Zod validation — good pattern
- Test files properly mock `process.env`

**Recommendation**: Consolidate remaining `process.env` accesses through the env module. For runtime-only flags (not needed at validation time), consider a `getRuntimeConfig()` helper that documents all available flags.

### 2.5 Duplication — ✅ Low

The codebase shows good DRY principles:
- `withUserScope()` in DB package centralizes tenant isolation
- `withTelemetry()` wraps all 32 tools consistently
- `runWithFailover()` pattern in data package is reused across all providers
- `withRetry()` in AI package provides exponential backoff
- `createCategorizedLogger()` centralizes structured logging

**Minor duplication noted**:
- Two `extractUserMessageText` exports (one from `message-text.ts`, re-exported from `multi-agent/context.ts`) — intentional re-export, not true duplication
- Fallback provider walking logic appears twice in `agent.ts` (resolution catch + stream catch) — already addressed via shared `pickNextFallbackProvider()`

### 2.6 Async Patterns — ✅ Modern

- `Promise.all()` used extensively for parallelization (43 usages)
- `Promise.race()` used for timeouts
- `Promise.allSettled()` used for dashboard widgets (non-failing)
- `AsyncLocalStorage` for request context (no global state)
- `waitUntil()` pattern for fire-and-forget operations (titles, telemetry)

---

## 3. Package-by-Package Analysis

### 3.1 `packages/shared` — ✅ Strong Foundation

| Aspect | Rating | Notes |
|--------|--------|-------|
| Schema design | ✅ | Zod at boundaries, tool output schemas well-structured |
| Error model | ✅ | `AppError` with standardized codes, `formatErrorResponse()` |
| Logger | ✅ | Pino with categories, trace correlation, redaction |
| Env validation | ✅ | Zod-validated `ServerEnv`, BYOK type re-exports |
| Barrel file | ✅ | Well-documented, intentional exclusions for server-only modules |

### 3.2 `packages/db` — ✅ Well-Managed Migration Hygiene

| Aspect | Rating | Notes |
|--------|--------|-------|
| Schema design | ✅ | 50 tables, well-organized, `_extensions.ts` pattern |
| Migration hygiene | ✅ | 53 migrations, idempotent, SHA-256 hash stability |
| PGlite support | ✅ | Embedded Postgres for local dev, graceful fallback |
| RLS support | ✅ | Tenant isolation via `app.current_tenant` GUC |
| Pool management | ✅ | Per-runtime pool sizing (5 web, 3 worker) |

**Concern**: `drizzle.config.ts` uses `console.warn` for migration status checks — intentional per comment but inconsistent with pino logger elsewhere.

### 3.3 `packages/data` — ✅ Clean Provider Abstraction

| Aspect | Rating | Notes |
|--------|--------|-------|
| Provider model | ✅ | `MarketDataProvider` interface with `runWithFailover()` |
| Failover | ✅ | Health-aware ordering, empty-vs-error distinction |
| Caching | ✅ | Memory cache with SWR, single-flight dedup |
| Throttling | ✅ | Token-bucket with Postgres-backed option |

### 3.4 `packages/indicators` — ✅ Focused & Tested

| Aspect | Rating | Notes |
|--------|--------|-------|
| Scope | ✅ | Pure mathematical functions, no side effects |
| SMC module | ✅ | Well-structured submodules (swings, structure, FVG, OB, liquidity) |
| Registry | ✅ | Dynamic indicator resolution with Zod parameter parsing |
| Testing | ✅ | Property-based tests (`property.test.ts`) |

### 3.5 `packages/ai` — ⚠️ Most Complex, Needs Refactoring

This is the most sophisticated package but also the largest and most complex.

| Aspect | Rating | Notes |
|--------|--------|-------|
| Agent core | ✅ | Well-documented `runChat()` with clear step-by-step comments |
| Tool system | ✅ | 32 tools, consistent `withTelemetry()` wrapping, `ToolContext` via AsyncLocalStorage |
| Model resolution | ⚠️ | `model.ts` at 870 lines — could be split by provider transport |
| BYOK providers | ⚠️ | `byok-providers.ts` at 1,291 lines — monolithic factory, should split |
| Multi-agent | ✅ | Clean agent hierarchy (`BaseAgent` → specialized agents) |
| Budget system | ✅ | Atomic reservation via `tryReserveBudget()` with int64 counter |
| Planner | ✅ | Plan-then-act pattern, fails gracefully |
| Citation enforcement | ✅ | Post-finish heuristic fact-checking |
| Fallback | ✅ | Provider fallback chain with automatic retry |
| Rate limiting | ✅ | Token-bucket LLM throttling with `awaitLlmHeadroom()` |

**Recommendation**: `byok-providers.ts` is the most urgent refactoring candidate. At 1,291 lines, it's a single-file factory for 9+ AI providers. Splitting into per-provider files with a shared registry would dramatically improve maintainability.

### 3.6 `apps/web` — ⚠️ Large but Well-Organized

| Aspect | Rating | Notes |
|--------|--------|-------|
| Route structure | ✅ | Next.js 15 App Router, consistent patterns |
| API routes | ✅ | 93 routes, `withAuth()` wrapper, Zod validation |
| Middleware | ✅ | Edge-safe, CSRF double-submit, signed `x-user-id` header |
| Auth | ✅ | NextAuth v5, Credentials + JWT, account lockout, TOTP 2FA |
| Settings page | ⚠️ | `actions.ts` at 1,222 lines — split by domain |
| Chat UI | ⚠️ | `chat-screen.tsx` at 756 lines — extract state management |
| Chart components | ⚠️ | Multiple `any` casts for library compatibility |
| E2E tests | ✅ | 16 Playwright spec files, global auth setup |

### 3.7 `apps/worker` — ✅ Clean & Focused

| Aspect | Rating | Notes |
|--------|--------|-------|
| Structure | ✅ | Clear separation: consumer, aggregator, jobs, scheduler |
| Job model | ✅ | `CronLock` with DB-based dedup |
| SignalR consumer | ✅ | Reconnect logic, `TickBuffer` for batching |
| Candle aggregator | ✅ | 1-minute UPSERT, partial bar updates |
| Testing | ✅ | Comprehensive test coverage |

---

## 4. Testing Infrastructure

### 4.1 Coverage & Distribution

| Metric | Value |
|--------|-------|
| Test files | **188** (`.test.ts`/`.test.tsx`/`.spec.ts`) |
| Source code lines | **~130,531** |
| Test code lines | **~29,049** |
| Approximate test ratio | **~22%** |
| E2E spec files | **16** (Playwright) |
| Load test scenarios | **18** (k6) |

### 4.2 Test Quality — ✅ Good

- Each package has its own `vitest.config.ts`
- Shared test utilities package (`packages/test-utils`) with factories and mocks
- PGlite used for DB integration tests (no external DB dependency)
- Property-based tests in indicators package
- Race condition tests (`budget-race.test.ts`)
- E2E tests cover auth, chat, dashboard, settings, accessibility, responsive design

### 4.3 Gaps

- No code coverage thresholds enforced in CI
- Some large files (e.g., `settings/actions.ts` at 1,222 lines) have tests but limited coverage for edge cases
- Worker tests don't use the shared test-utils package
- No contract tests between packages

---

## 5. Configuration & Tooling

### 5.1 Build System — ✅ Modern

- **Turborepo v2**: Proper task dependencies, caching, parallel builds
- **pnpm**: Workspace management with dependency overrides
- **TypeScript 5.7**: Strict mode with advanced flags
- **ESLint flat config**: 8 config files, consistent rules
- **Prettier**: Import sorting, Tailwind plugin
- **Changesets**: Release management configured

### 5.2 CI/CD — ✅ Comprehensive

- `ci-fast.yml` and `ci-slow.yml` workflows
- Docker publish workflow
- Load test workflow
- Stale issue management
- PR labeler
- CodeQL security analysis

---

## 6. Security Assessment

### 6.1 Strengths — ✅ Excellent

- **By-design security**: RLS for multi-tenant isolation
- **HMAC-signed `x-user-id` header**: Defense-in-depth against header spoofing
- **CSRF double-submit cookie**: `__Host-` prefix in production
- **BYOK encryption**: AES-256-GCM for stored API keys, `server-only` guard on `encryption.ts`
- **JWT session management**: No stateful sessions
- **Account lockout**: 5 attempts → 15 min lockout
- **TOTP 2FA**: Enforced at login
- **Timing-safe comparisons**: `timingSafeEqual` for HMAC verification
- **No raw error messages leaked to clients**: `formatErrorResponse()` sanitizes

### 6.2 Concerns — ⚠️ Minor

- `process.env.AUTH_MODE = 'legacy'` path still active (gated behind dev-only check) — should be completely removed
- Some `console.warn` calls in auth path may leak information in stack traces
- `debug/route.ts` exposes runtime diagnostics — properly gated to `NODE_ENV !== 'production'`

---

## 7. Technical Debt Inventory

### Critical (should address within 1-2 sprints)

| # | Item | Location | Effort |
|---|------|----------|--------|
| T1 | Split `byok-providers.ts` (1,291 lines) into per-provider modules | `packages/ai/src/byok-providers.ts` | Medium |
| T2 | Migrate remaining `console.*` calls to pino structured logger | 60+ locations annotated with `OBS-09` | Medium |
| T3 | Fix `convene-committee.ts` file-level eslint-disable | `packages/ai/src/tools/convene-committee.ts` | Small |

### High (should address within 1-3 sprints)

| # | Item | Location | Effort |
|---|------|----------|--------|
| T4 | Split `settings/actions.ts` (1,222 lines) by domain | `apps/web/src/app/(app)/settings/actions.ts` | Large |
| T5 | Split `model.ts` (870 lines) by provider transport | `packages/ai/src/model.ts` | Medium |
| T6 | Extract chat state management from `chat-screen.tsx` (756 lines) | `apps/web/src/components/chat/chat-screen.tsx` | Medium |
| T7 | Consolidate `process.env` access through env modules | 196 locations across codebase | Large |

### Medium (should address within 3-6 sprints)

| # | Item | Location | Effort |
|---|------|----------|--------|
| T8 | Reduce `as any` casts in chart components | `apps/web/src/components/chart/` | Small |
| T9 | Extract reusable chart hooks from inline logic | `chart-canvas.tsx`, `chart-view.tsx` | Medium |
| T10 | Add code coverage thresholds to CI | CI config | Small |
| T11 | Standardize error constructors (AppError vs throw new Error) | Various | Medium |

### Low (nice to have)

| # | Item | Location | Effort |
|---|------|----------|--------|
| T12 | Remove legacy auth mode (`AUTH_MODE=legacy`) | `apps/web/src/middleware.ts`, auth config | Small |
| T13 | Add contract tests between packages | All packages | Large |
| T14 | Consolidate `empty.ts` test stubs | `apps/web/test/empty.ts`, `apps/worker/test/empty.ts` | Trivial |
| T15 | Consider Biome for faster linting/formatter | Project-wide | Medium |

---

## 8. Summary of Scores

| Dimension | Grade | Notes |
|-----------|-------|-------|
| Architecture | **A-** | Well-layered, clear boundaries, good dependency chain |
| Code Quality | **B+** | Generally high, but oversized files and `any` casts drag it down |
| TypeScript Safety | **B+** | Strict mode everywhere, but 166 `any` usages weaken guarantees |
| Error Handling | **A-** | Excellent error model, but inconsistent adoption |
| Testing | **B+** | 188 test files, E2E + load tests, but no coverage thresholds |
| Documentation | **A** | AGENTS.md is outstanding, 20+ architecture docs |
| Security | **A-** | Defense-in-depth, RLS, HMAC signing, BYOK encryption |
| Maintainability | **B+** | Mostly good, but key files are oversized |
| Configuration | **A-** | Modern tooling, turborepo, consistent configs |
| **OVERALL** | **B+/A-** | Production-grade with manageable tech debt |

---

## 9. Top 5 Action Items

1. **Split `byok-providers.ts`** — The single biggest maintainability risk. At 1,291 lines covering 9+ AI providers, changes are error-prone and PRs touch the same file constantly.

2. **Complete the logger migration** — 60+ `console.*` calls remain in production paths. The migration is already planned (annotated with `OBS-09 Phase 5.3`). Finish it.

3. **Break up `settings/actions.ts`** — 1,222 lines of server actions covering API keys, preferences, billing, models, notifications, and more. Each domain should have its own actions file.

4. **Reduce `any` type usage** — Target the chart components and `with-telemetry.ts` for generic refactoring. File-level `eslint-disable` comments should be eliminated.

5. **Add code coverage thresholds** — Enforce minimum coverage (e.g., 80% line coverage) in CI to prevent regression and identify untested code paths.

---

*Report generated via automated static analysis, pattern detection, and architectural review of the HamaFX-Ai monorepo. 188 test files analyzed. 53 migration files verified. ~130K lines of TypeScript audited.*
