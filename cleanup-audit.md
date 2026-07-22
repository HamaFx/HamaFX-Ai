# HamaFX-Ai Cleanup Audit

## Executive Summary

HamaFX-Ai is a **mature, well-structured, production-grade** open-source AI trading platform. The codebase — a pnpm monorepo with 8 packages, a Next.js 15 web app, and a Node.js worker daemon — demonstrates strong engineering discipline: strict TypeScript, comprehensive testing (590+ test cases), clear architectural boundaries, and well-documented design patterns.

This audit identified **minimal truly dead code**. The most recent CHANGELOG entry (`"comprehensive codebase cleanup"`) indicates an active maintenance culture. The majority of findings are **documentation staleness, migration artifacts, deprecated-backward-compatibility patterns, and development-phase labeling cruft** rather than genuinely unused code.

### Overall Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Code quality | ★★★★☆ | Strong patterns, strict TS, good test coverage |
| Maintainability | ★★★★☆ | Clear package boundaries, well-documented |
| Dead code | ★★★★★ | Very little — most "suspicious" code is actually used |
| Documentation freshness | ★★★☆☆ | Several stale references to archived/removed docs |
| Dependency hygiene | ★★★★☆ | Clean workspace deps; root has minor cruft |
| Migration cleanliness | ★★★★☆ | One deprecated placeholder file; otherwise clean |

---

## High-Level Architecture Understanding

The project is a **pnpm monorepo** with Turborepo orchestration:

```
┌──────────────────────────────────────────────┐
│ apps/web (Next.js 15, Edge middleware)        │
│   └─ SSR pages, API routes, chat UI, PWA      │
├──────────────────────────────────────────────┤
│ apps/worker (Node.js daemon, GCE VM)          │
│   └─ SignalR consumer, tick buffer, 1m candles│
│      systemd timers → 7 heavy cron jobs       │
├──────────────────────────────────────────────┤
│ packages/ai      — Agent core, 32 tools,      │
│                    routing, memory, multi-agent│
│ packages/data    — Market data adapters,       │
│                    failover, caching           │
│ packages/db      — Drizzle ORM, 50 tables     │
│ packages/shared  — Zod schemas, env, types    │
│ packages/indicators — Technical indicators     │
│ packages/config  — ESLint/Prettier/TS configs  │
│ packages/test-utils — Shared test factories    │
└──────────────────────────────────────────────┘
```

**Deployment topology:** Vercel (web) + GCE VM (worker) + Supabase (Postgres + pgvector).

---

## Findings

### 1. Dead / Deprecated Code

#### 1.1 `packages/db/run_drizzle.py` — Deprecated Placeholder
**Confidence: HIGH** | **Impact: LOW**

This 5-line Python file explicitly declares itself deprecated. The original pexpect wrapper was removed in Phase 5 (MIG-2). The file exists only as a placeholder with instructions to use `drizzle-kit generate --custom` instead.

**Evidence:** File content reads: `"This file has been deprecated and is intentionally kept as a placeholder."`

**Recommendation:** Delete it. It serves no purpose.

#### 1.2 `decision_signals` Table — Dropped in Migration 0052
**Confidence: HIGH** | **Impact: LOW**

The `decision_signals` table was dropped in migration `0052_drop_decision_signals.sql`. A follow-up migration `0058_drop_linked_signal_id.sql` removed a foreign key column from `portfolio_positions`. Several test files reference the removal.

**Evidence:**
- `packages/db/test/phase2-3-migrations.test.ts` L337: `"Table removed — decision_signals feature deprecated (Plan A)"`
- Migration files: `0052_drop_decision_signals.sql`, `0058_drop_linked_signal_id.sql`

**Recommendation:** No action needed — already cleaned up. The test references are documentation, not dead code.

#### 1.3 `NEXTAUTH_SECRET` — Deprecated Backward Compatibility
**Confidence: HIGH** | **Impact: MEDIUM**

`NEXTAUTH_SECRET` is deprecated in favor of `AUTH_SECRET`. Code exists in multiple places to handle the backward compatibility:

- `apps/web/src/lib/env.ts` L36-38, L170-172: Deprecation warning, schema optional
- `apps/web/src/auth.config.ts` L15, L43: Falls back to `NEXTAUTH_SECRET`
- `apps/web/src/auth.ts` L71, L92: Uses `AUTH_SECRET || NEXTAUTH_SECRET`
- `packages/shared/src/env.ts` L42, L265: Both env vars accepted
- 46 total references across the codebase

**Evidence:** Comment at `apps/web/src/lib/env.ts` L36 says: `"NEXTAUTH_SECRET kept as deprecated fallback for backward compatibility."`

**Recommendation:** Plan removal in a future major version. Add a timeline (e.g., "Remove by Q4 2026") to the deprecation warning.

#### 1.4 Phase 8 PR Vercel Cron Fallback Routes
**Confidence: MEDIUM** | **Impact: LOW**

Several `/api/cron/*` routes are explicitly documented as "manual-fallback paths" since the worker daemon now handles these jobs via systemd timers:

- `/api/cron/embedding-backfill` — "manual-fallback path" (Phase 8 PR-9)
- `/api/cron/briefings` — "manual-fallback path" (Phase 8 PR-10)
- `/api/cron/snapshots` — "manual-fallback path" (Phase 8 PR-11)
- `/api/cron/cot` — "manual-fallback path" (Phase 8 PR-12)
- `/api/cron/fred-actuals` — "manual-fallback path" (Phase 8 PR-13)
- `/api/cron/weekly-review` — "manual-fallback path" (Phase 8 PR-14)

**Uncertainty:** These are intentionally kept as manual fallbacks. They should not be removed without confirming they are never needed for disaster recovery.

**Recommendation:** Add a comment at each route explaining under what circumstances a human would invoke it as a fallback, and consider adding a `DEPRECATED` header if they truly should never be used.

#### 1.5 `scripts/scratch/` — One-Off Debugging Scripts
**Confidence: HIGH** | **Impact: LOW**

Contains 4 files: `README.md`, `check_fk.cjs`, `test-auth.js`, `test-env.ts`. The README explains these are "one-off debugging scripts" moved during a Phase C cleanup. They are gitignored by `.gitignore`.

**Recommendation:** Already properly handled — gitignored and documented. No action needed. Consider if any are still referenced by team members before deleting.

---

### 2. Documentation Staleness

#### 2.1 Broken Reference: `docs/SETTINGS_CLEANUP.md`
**Confidence: HIGH** | **Impact: LOW**

`AGENTS.md` L314 references `docs/SETTINGS_CLEANUP.md` but the file does not exist on disk.

**Evidence:** `AGENTS.md` references it; `ls docs/SETTINGS_CLEANUP.md` returns NOT FOUND.

**Recommendation:** Either restore the file or remove the reference from AGENTS.md.

#### 2.2 Stale `docs/archive/` References in Active Docs
**Confidence: MEDIUM** | **Impact: LOW**

Multiple docs still reference paths under `docs/archive/` and `docs/review/` that may not exist after the recent archive cleanup mentioned in CHANGELOG.md (L28: "35 legacy docs archived to `docs/archive/`").

**Evidence:** Found in `docs/01-architecture.md`, `docs/05-security-auth-compliance.md`, `docs/02-data-flows.md`, `docs/06-deployment-self-hosting.md`.

**Uncertainty:** Some referenced files still exist in `docs/archive/`; some do not. Would need to verify each reference individually.

**Recommendation:** Run a link checker over all docs. Verify every `docs/archive/` and `docs/review/` reference resolves to an existing file.

#### 2.3 `BILLING-WEBHOOK-SAFETY-GATE.md` Location Confusion
**Confidence: MEDIUM** | **Impact: LOW**

The file exists at `docs/BILLING-WEBHOOK-SAFETY-GATE.md` (confirmed). Some docs reference it as `docs/archive/BILLING-WEBHOOK-SAFETY-GATE.md` (e.g., `docs/01-architecture.md` L433, `docs/05-security-auth-compliance.md` L207), which suggests it was moved from archive to active docs but references weren't updated.

**Recommendation:** Update stale references to point to the current location.

#### 2.4 References to Removed Files
**Confidence: MEDIUM** | **Impact: LOW**

CHANGELOG.md L34 mentions that `DESIGN_SYSTEM_AND_UX_ROADMAP.md` was "removed from root — archived." If the file was removed rather than moved, any references to it are stale.

**Recommendation:** Verify no code or docs still reference removed files.

---

### 3. Dependency & Package Hygiene

#### 3.1 Root `package.json` Dependencies
**Confidence: MEDIUM** | **Impact: LOW**

The root `package.json` has `ws` as a `dependency` (not devDependency). `ws` is only imported in `apps/worker` (which has its own `ws` dependency) — specifically `apps/worker/src/binance/consumer.ts` and `apps/worker/src/base-ws-consumer.ts`. The root `ws` dependency appears unused.

Similarly:
- `lighthouse` in root devDependencies is only used in `tools/lighthouse/run.mjs`
- `bcryptjs` in root devDependencies is only used in `apps/web` (which has its own `bcryptjs` dep)
- `chrome-launcher` in root devDependencies is only used by lighthouse tooling

**Uncertainty:** These may have been hoisted for workspace efficiency. Knip config already ignores some of these.

**Recommendation:** Review and remove if confirmed unused at root level. These should be in the packages that actually use them.

#### 3.2 `redis` Dependency in `packages/data`
**Confidence: HIGH — ACTIVELY USED** | **Impact: N/A**

The `redis` package is imported only in `packages/data/src/cache/redis.ts` and conditionally used when `REDIS_URL` is configured. This is correctly placed.

**Recommendation:** No action needed.

#### 3.3 `web-push` in `packages/ai`
**Confidence: HIGH — ACTIVELY USED** | **Impact: N/A**

Used in `packages/ai/src/push/send.ts` for web push notifications. Correctly placed.

**Recommendation:** No action needed.

#### 3.4 `server-only` Package
**Confidence: HIGH — ACTIVELY USED** | **Impact: N/A**

Extensively used across the codebase (58 matches) as a build-time guard to prevent server-only code from leaking into client bundles. Multiple test configs mock it.

**Recommendation:** No action needed.

---

### 4. Code Quality Observations

#### 4.1 Extensive `eslint-disable` Comments
**Confidence: HIGH** | **Impact: LOW-MEDIUM**

~55 occurrences of `eslint-disable` comments across the codebase, mostly `@typescript-eslint/no-explicit-any`. While most are in test files (acceptable), several exist in production code:
- `packages/ai/src/agent.ts` (4 occurrences)
- `packages/ai/src/llm-client.ts` (2 occurrences)
- `apps/web/src/auth.ts` (4 occurrences)
- `apps/web/src/middleware.ts` (1 occurrence)

**Recommendation:** Review production-code disables and add justifications. Consider replacing with more specific type narrowing where feasible.

#### 4.2 Heavy Type Cast Usage
**Confidence: HIGH** | **Impact: LOW**

188 occurrences of `as unknown as`, `as any`, or `as never` patterns. Most are in test files (expected). Some in production code represent necessary interop with loosely-typed libraries (AI SDK, drizzle-orm).

**Recommendation:** No immediate action — these are mostly necessary for the Vercel AI SDK v5 interop. Monitor as the SDK matures.

#### 4.3 Development Phase Labels in Code
**Confidence: MEDIUM** | **Impact: LOW**

The codebase contains extensive "Phase X", "PR-YY", "PF-ZZ", "SRP-X" labels in comments (194+ matches for "Phase" alone). These were useful during development but will become stale noise over time.

**Examples:**
- `"Phase 8 PR-6: the worker now holds a persistent BiQuote SignalR connection"`
- `"PF-22 — Chat threads service layer"`
- `"SRP-1: The retry/fallback loop and budget reservation have been extracted"`

**Recommendation:** Consider a gradual removal of phase labels from comments during normal code maintenance. They serve as historical context but add noise. Keep architectural rationale comments; remove historical phase tracking labels.

#### 4.4 `console.info` / `console.warn` Usage in Production Code
**Confidence: MEDIUM** | **Impact: LOW**

59 non-test files use `console.info`, `console.warn`, or `console.log`. Many are gated behind `env.LOG_PROMPTS` (35 matches for `LOG_PROMPTS`), which is correct. But some are unconditional:
- `apps/web/src/hooks/use-local-storage.ts` L37, L53, L66
- `apps/web/src/hooks/use-voice-input.ts` L137, L162
- `packages/db/src/client.ts` L154

**Recommendation:** Ensure all production console statements are either:
1. Gated behind a debug flag
2. Using the structured pino logger
3. Explicitly justified as user-facing warnings

---

### 5. Configuration Cleanup

#### 5.1 `turbo.json` `globalEnv` List
**Confidence: MEDIUM** | **Impact: LOW**

`turbo.json` lists 48 environment variables as `globalEnv`. Some may be obsolete:
- `POSTGRES_PRISMA_URL` — Prisma is not used in the project
- `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — multiple Supabase keys listed; verify all are needed

**Uncertainty:** These may be needed for Supabase client initialization even if not directly referenced.

**Recommendation:** Audit the turbo.json globalEnv list against actual `process.env` usage. Remove any that are never read.

#### 5.2 `.changeset/` — Changesets Configuration
**Confidence: LOW** | **Impact: LOW**

The project has `@changesets/cli` configured but the current version is `0.0.0` across all packages. Changesets is typically used for versioned package publishing.

**Uncertainty:** The project may plan to use changesets for future releases, or it may be legacy.

**Recommendation:** If the project doesn't plan to publish packages to npm, consider removing changesets. If it does, document the release process.

---

### 6. Duplicate Logic Assessment

**No significant duplicate logic was found.** The codebase follows good practices:
- Tool output schemas are defined once in `packages/shared/src/schemas/tool-outputs/` and consumed by both `packages/ai` (tool implementations) and `apps/web` (UI rendering)
- The failover pattern (`runWithFailover`) is centralized in `packages/data/src/failover.ts`
- Service layers (`PF-22`) are extracted into `apps/web/src/lib/services/`
- Query helpers are centralized in `packages/db/src/queries/`

The pattern of co-located files (shared schema → ai tool → web UI component) is intentional layering, not duplication.

---

### 7. Load Testing Infrastructure

**Confidence: MEDIUM** | **Impact: LOW**

The `loadtest/` directory contains 19 test files with comprehensive scenarios (smoke, load, stress, spike, soak for read mix, write mix, market read, chat, config mix). The infrastructure appears well-maintained with shared configs for load profiles and thresholds.

**Recommendation:** Verify that all load test scenarios are still run in CI. Check if `loadtest/tests/load-config-mix.ts` and `loadtest/tests/smoke-config-mix.ts` are still relevant. The config-mix scenarios may test a deprecated configuration surface.

---

### 8. Areas Requiring Further Investigation

1. **e2e test coverage**: 16 Playwright spec files exist. Verify all still pass and cover active features (not deprecated flows).

2. **Vector embedding fallback**: PGlite uses `real[]` fallback (no pgvector in WASM). Verify this path is still exercised and maintained.

3. **Knip dead-code detection**: The project has a `knip.json` config. Running `npx knip` could identify unused exports that this audit may have missed. The knip config explicitly ignores test files and some dependencies.

4. **Docker Compose configuration**: Verify `docker-compose.yml` services match current architecture. The `docker/postgres/init-langfuse-db.sh` script suggests Langfuse integration that may need verification.

5. **Infrastructure scripts**: `infra/cron-vm/` contains deployment scripts. Verify the `docker-autoheal.sh` and systemd timer units are current.

---

## Confidence Summary

| Finding | Confidence |
|---------|-----------|
| `run_drizzle.py` dead | **HIGH** |
| `decision_signals` already cleaned | **HIGH** |
| `NEXTAUTH_SECRET` deprecated | **HIGH** |
| Vercel cron fallback routes | **MEDIUM** |
| `scripts/scratch/` one-off | **HIGH** |
| `SETTINGS_CLEANUP.md` broken ref | **HIGH** |
| Stale archive doc references | **MEDIUM** |
| Root deps unused (`ws`, `lighthouse`) | **MEDIUM** |
| `turbo.json` env var bloat | **MEDIUM** |
| Phase label noise | **MEDIUM** |
| No duplicate logic | **HIGH** |
| `console.*` in production | **MEDIUM** |

---

## Estimated Cleanup Impact

| Category | Files Affected | Risk | Effort |
|----------|---------------|------|--------|
| Remove dead code (run_drizzle.py) | 1 | None | Trivial |
| Fix doc references | 5-8 | None | Low |
| Audit root dependencies | 2-3 | Low | Low |
| Deprecation timeline for NEXTAUTH_SECRET | ~10 | Medium | Medium |
| Audit turbo.json env vars | 1 | Low | Low |
| Clean phase labels | 50+ | Low | Medium (ongoing) |
| Review console statements | ~15 | Low | Low |
