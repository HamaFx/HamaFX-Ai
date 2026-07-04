# Contributing to HamaFX-Ai

> **First time here?** Read [docs/07-agent-understanding.md](docs/07-agent-understanding.md) for project architecture and [docs/08-agent-setup-run.md](docs/08-agent-setup-run.md) to get a local instance running.

Thank you for considering a contribution to HamaFX-Ai. This document is the definitive guide for contributors — from first clone to merged PR.

---

## 1. Prerequisites

| Requirement | Version | Verify |
|-------------|---------|--------|
| Node.js | ≥ 20.11 | `node --version` |
| pnpm | 9.15.4 (pinned via `packageManager`) | `pnpm --version` |
| Git | any | `git --version` |
| Docker | optional, for full-feature dev with pgvector | `docker --version` |

No database installation required for local dev — PGlite (embedded Postgres) boots automatically.

---

## 2. Quick Start

```bash
# Fork and clone
git clone https://github.com/<your-username>/HamaFX-Ai.git
cd HamaFX-Ai

# Install dependencies
pnpm install

# Set up at least one AI provider key
echo 'GOOGLE_GENERATIVE_AI_API_KEY=AIza...' >> .env.local

# Start dev server (PGlite auto-boots, secrets auto-generate)
pnpm dev:local

# Open http://localhost:3000
```

Auth secrets (`AUTH_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET`) auto-generate to `.hamafx/dev-secrets.json` on first boot. See [docs/08-agent-setup-run.md](docs/08-agent-setup-run.md) for full setup details.

---

## 3. Monorepo Structure

HamaFX-Ai is a Turborepo monorepo with a strict dependency chain:

```
config → shared → db + indicators → data → ai → web + worker
```

| Package | Path | Responsibility |
|---------|------|----------------|
| `@hamafx/config` | `packages/config/` | Shared ESLint, Prettier, TypeScript configs |
| `@hamafx/shared` | `packages/shared/` | Zod schemas, env validation, encryption, billing types |
| `@hamafx/db` | `packages/db/` | Drizzle ORM schema (46 tables), Postgres/PGlite client, migrations |
| `@hamafx/indicators` | `packages/indicators/` | Technical indicators (RSI, MACD, ATR, Bollinger, SMC) |
| `@hamafx/data` | `packages/data/` | Market data providers (BiQuote, Finnhub, Marketaux, FRED, etc.) with failover |
| `@hamafx/ai` | `packages/ai/` | AI agent core — 32 tools, model routing, multi-agent committee, memory, persistence |
| `@hamafx/test-utils` | `packages/test-utils/` | Shared test factories, mocks, vitest helpers |
| `@hamafx/web` | `apps/web/` | Next.js 15 PWA — 29 pages, 78 API routes, auth, chat, charts |
| `@hamafx/worker` | `apps/worker/` | Node.js daemon — SignalR consumer, tick processing, scheduled jobs |

**Rule:** No package may import upstream of itself in the dependency chain. `shared` is the foundation — everything depends on it, it depends on nothing but `config`.

See [docs/01-architecture.md](docs/01-architecture.md) for the full architecture diagram.

---

## 4. Coding Conventions

### 4.1 File Naming

| Pattern | Example | Where |
|---------|---------|-------|
| `kebab-case.ts` | `get-candles.ts`, `memory-index.ts` | Modules, tools, utilities |
| `PascalCase.tsx` | `ChatScreen.tsx`, `NavDrawer.tsx` | React components |
| `_prefix.ts` | `_extensions.ts`, `_provision.sh` | Private/internal files |
| `*.test.ts` | `candle-1m.test.ts` | Test files (co-located) |
| `route.ts` | `api/chat/route.ts` | Next.js API route handlers |
| `page.tsx` | `(app)/chat/page.tsx` | Next.js pages |

### 4.2 TypeScript

- **Strict mode** — `tsconfig.base.json` with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- No `any` without an `eslint-disable` comment explaining why
- Zod validation at every package boundary — input schemas, output schemas, env validation
- Use `import type` for type-only imports

### 4.3 Database

- Drizzle ORM with `pgTable()` definitions in `packages/db/src/schema/`
- All user-data tables must have `user_id` (text FK → `user.id`) and `tenant_id` (text) columns
- UUIDs via `gen_random_uuid()` (pgcrypto)
- Soft-delete via `deletedAt` timestamp column
- pgvector for embeddings (`vector(1536)` in Postgres, `real[]` in PGlite)
- **New tables must work in PGlite** — no RLS, no pgvector-specific features without fallback

### 4.4 Error Handling

- Use standardized error codes from `packages/shared/src/errors.ts`
- API responses follow the envelope: `{ data: ... }` or `{ error: { code, message, details } }`
- Data layer: `ProviderError` / `ProviderEmptyError` for provider failures
- AI layer: `BudgetExceededError` for cost guardrail

### 4.5 State & Context

- `AsyncLocalStorage` via `withToolContext()` / `withDiagnostics()` — no global state
- Each tool call accesses context via `getToolContext()` (threadId, env, signal, budget)
- `withTenantDb()` sets `app.current_tenant` GUC for RLS when enabled
- Never use module-level mutable state for request-scoped data

### 4.6 Exports

- Every package has `src/index.ts` barrel export
- Deep imports via `exports` field in `package.json` (e.g., `@hamafx/db/schema`, `@hamafx/db/client`)
- No circular dependencies — the dependency chain is strictly layered

---

## 5. Development Workflow

### 5.1 Branching

```bash
# Create a feature branch from main
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

**Branch naming conventions:**

| Prefix | Use |
|--------|-----|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `refactor/` | Code refactoring |
| `test/` | Test improvements |
| `chore/` | Tooling, deps, config |

### 5.2 Committing

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`

**Examples:**
```
feat(ai): add get_social_sentiment tool for retail positioning
fix(auth): check tokenVersion in JWT callback
docs: update architecture diagram for worker changes
refactor(data): extract circuit breaker to its own module
```

### 5.3 Before You Push

```bash
# Typecheck
pnpm typecheck

# Lint
pnpm lint

# Run all tests
pnpm turbo run test -- --run

# Build (catches next build errors)
pnpm turbo run build
```

All four must pass. CI will run them again but catching locally saves time.

### 5.4 Pull Request

1. Push your branch to your fork
2. Open a PR against `main` using the [PR template](.github/PULL_REQUEST_TEMPLATE.md)
3. CI runs automatically: lint + typecheck + build + unit tests + coverage
4. Address any review feedback
5. Squash-merge when approved

**PR size guideline:** Keep PRs under 500 lines of diff where possible. Break large features into stacked PRs. If a PR must be large, explain why in the description.

---

## 6. Testing

### 6.1 Test Stack

| Runner | Scope | Files |
|--------|-------|-------|
| Vitest | Unit + integration | 90+ test files, 590+ test cases |
| Playwright | E2E | 7 spec files in `apps/web/tests/e2e/` |
| AI Eval Harness | AI quality | `packages/ai/src/eval/` (manual, nightly in CI) |

### 6.2 Running Tests

```bash
# All packages
pnpm turbo run test -- --run

# Single package
pnpm --filter @hamafx/ai test -- --run
pnpm --filter @hamafx/web test -- --run
pnpm --filter @hamafx/data test -- --run
pnpm --filter @hamafx/worker test -- --run
pnpm --filter @hamafx/db test -- --run
pnpm --filter @hamafx/shared test -- --run
pnpm --filter @hamafx/indicators test -- --run

# With coverage
pnpm turbo run test -- --coverage

# E2E (requires running app)
pnpm --filter @hamafx/web exec playwright test

# Watch mode (dev only — never in CI)
pnpm --filter @hamafx/indicators test
```

> **Always use `-- --run`** with vitest. Without it, vitest enters watch mode and hangs in CI.

### 6.3 Writing Tests

- **Co-locate** test files next to the module: `get-candles.ts` → `get-candles.test.ts`
- Use `@hamafx/test-utils` for shared factories (`users.ts`, `threads.ts`, `candles.ts`) and mocks (`db.ts`, `fetch.ts`, `llm.ts`)
- Every new tool must have a test in `packages/ai/test/`
- Every new API route should have a test in `apps/web/test/`
- Every new indicator must have a test in `packages/indicators/test/`
- Test file guard: `pnpm test:empty-guard` ensures no empty test files

### 6.4 E2E Tests

E2E tests use Playwright with a real app instance:

| Spec | Tests |
|------|-------|
| `auth.spec.ts` | Login, register, logout |
| `chat.spec.ts` | Chat flow, tool rendering |
| `isolation.spec.ts` | Multi-tenant data isolation |
| `multi-agent.spec.ts` | Committee deliberation |
| `service-worker.spec.ts` | PWA service worker |
| `settings.spec.ts` | Settings pages |

E2E tests require:
- Running app (`pnpm dev:local`)
- PGlite or Postgres
- At least one AI provider key

---

## 7. Adding New Features

### 7.1 Adding an AI Tool

1. **Define schema** in `packages/shared/src/schemas/tool-outputs/<tool-name>.ts` (Zod input + output)
2. **Implement tool** in `packages/ai/src/tools/<tool-name>.ts` — follow the existing pattern (InputSchema, execute function)
3. **Register** in `packages/ai/src/tools/index.ts` with `withTelemetry('<tool_name>', tool)`
4. **Add tool name** to `packages/shared/src/ai/tool-names.ts`
5. **Add UI part** in `apps/web/src/components/chat/parts/<tool-name>.tsx`
6. **Register UI part** in `apps/web/src/components/chat/parts/registry.tsx`
7. **Write tests** in `packages/ai/test/<tool-name>.test.ts`
8. **Update docs** if the tool changes user-facing behavior

### 7.2 Adding a Database Table

1. **Define schema** in `packages/db/src/schema/<name>.ts` using `pgTable()`
2. **Export** from `packages/db/src/schema/index.ts`
3. **Add `user_id` and `tenant_id`** columns (if user-data table)
4. **Generate migration:** `pnpm --filter @hamafx/db migrate:gen`
5. **Test PGlite compatibility** — no RLS, no pgvector-specific features without fallback
6. **Add RLS policy** if the table contains user data (migrations 0035–0039 pattern)
7. **Write tests** in `packages/db/test/`
8. **Update docs/03-backend-api.md** ER reference

### 7.3 Adding an API Route

1. **Create route** at `apps/web/src/app/api/<path>/route.ts`
2. **Use `withAuth()` wrapper** for authenticated routes (extracts `user.userId`)
3. **Validate body** with `parseJsonBody(req, ZodSchema)`
4. **Use standardized response envelope** (`{ data }` or `{ error: { code, message } }`)
5. **Add rate limiting** with `withRateLimit()` if needed
6. **Write tests** in `apps/web/test/route-<name>.test.ts`
7. **Update docs/03-backend-api.md** route table

### 7.4 Adding a Data Provider

1. **Create provider directory** at `packages/data/src/providers/<name>/`
2. **Implement** `index.ts` (exports), `rest.ts` (API calls), `map.ts` (symbol/timeframe mapping)
3. **Add to failover chain** in the relevant adapter (`packages/data/src/adapters/`)
4. **Add env var** to `.env.example` and `packages/shared/src/env.ts` (Zod validation)
5. **Write tests** in `packages/data/test/<name>-*.test.ts`
6. **Update docs/02-data-flows.md** provider table

---

## 8. High-Risk Areas

Read [docs/07-agent-understanding.md](docs/07-agent-understanding.md) §5 for the full list. Summary:

| Area | Risk | Rule |
|------|------|------|
| Auth code | Session validation, user isolation | Do NOT regress to single-password gate. Multi-tenant is load-bearing. |
| BYOK encryption | User API keys at rest | Never log decrypted keys. Use `redactSecrets()` in all diagnostic output. |
| Live-money paths | Risk calculations affect trading | All risk math must be tested. Never round or simplify without instruction. |
| RLS policies | Tenant isolation | Never disable RLS. New tables need RLS policies + `tenant_id`. |
| Billing webhook | Real money | HMAC-SHA512 verification before any business logic. |
| Middleware | Edge runtime | No DB calls, no Node.js imports in `middleware.ts`. |

---

## 9. Release Process

Releases are managed via [Changesets](https://github.com/changesets/changesets):

1. **Add a changeset** when you make a user-facing change:
   ```bash
   pnpm changeset
   ```
   This creates a file in `.changeset/` describing the change and version bump.

2. **Release PR:** When changesets accumulate, the `release.yml` GitHub Action creates a "Version Packages" PR that bumps versions and updates `CHANGELOG.md`.

3. **Publish:** Merging the release PR triggers `changesets/action` to publish packages.

4. **Docker images:** Published on GitHub Release via `docker-publish.yml` workflow (Trivy-scanned, pushed to `ghcr.io`).

---

## 10. CI/CD

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci-fast` | Pull request | Lint + typecheck + build + unit tests + coverage + test file guard |
| `ci-slow` | Push to main + nightly | Lint + typecheck + unit tests + E2E (Playwright) + nightly AI eval |
| `docker-publish` | Release published | Build + Trivy scan + push to GHCR |
| `release` | Push to main | Changesets release PR |
| `codeql` | Push/PR + weekly | CodeQL security analysis |
| `stale` | Daily | Mark stale issues (30d) and PRs (45d) |
| `pr-labeler` | PR opened | Auto-label based on changed files |

CI must pass before merge. E2E and AI evals run only on `main` and nightly (not on PRs).

---

## 11. Getting Help

- **Architecture questions:** Read [docs/01-architecture.md](docs/01-architecture.md)
- **Setup issues:** Read [docs/08-agent-setup-run.md](docs/08-agent-setup-run.md) §10 (Common Failures & Fixes)
- **Security questions:** Read [docs/05-security-auth-compliance.md](docs/05-security-auth-compliance.md)
- **Bugs:** [Open an issue](https://github.com/HamaFx/HamaFX-Ai/issues) using the bug report template
- **Feature requests:** [Open an issue](https://github.com/HamaFx/HamaFX-Ai/issues) using the feature request template
- **Security vulnerabilities:** See [SECURITY.md](SECURITY.md) — do NOT open a public issue

---

## 12. Code of Conduct

Participation in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and professional.

---

## 13. License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](LICENSE).
