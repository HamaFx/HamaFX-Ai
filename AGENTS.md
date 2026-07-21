# AGENTS.md — HamaFX-Ai Development Guide

> **For AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, etc.) working on this repository.**
> Read this FIRST before making any changes. It is the canonical source of truth for the project.

## Project Identity

**HamaFX-Ai** is an open-source, multi-tenant, chat-driven AI trading copilot for forex instruments: **XAUUSD** (primary), **EURUSD**, **GBPUSD**. It runs as a Next.js 15 PWA with a persistent Node.js worker daemon. The AI agent uses Vercel AI SDK v5 with 32 tools, domain-based model routing, and multi-agent committee deliberation.

- **License**: Apache-2.0
- **Status**: In production on Vercel + GCE VM. Phases 0–9 shipped (incl. multi-tenant v2.0). UX Upgrade Plan Phases A/B/C/D/E shipped.
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy) + Drizzle adapter. BYOK per user (9-provider registry). Strict `userId` scoping on all user-data tables.
- **Repo**: [github.com/HamaFx/HamaFX-Ai](https://github.com/HamaFx/HamaFX-Ai)

> **Auth status:** The auth system has been hardened. Features include: JWT session management, bcrypt password hashing, account lockout (5 attempts → 15 min), TOTP 2FA (enforced at login), timing-safe user enumeration prevention, signed `x-user-id` header (HMAC-SHA256) for route defense-in-depth, `userSessions` table for active session tracking with revoke support, and `tokenVersion` for "sign out everywhere". See [`auth.ts`](./apps/web/src/auth.ts) and [`auth.config.ts`](./apps/web/src/auth.config.ts) for the canonical implementation.

## Quick Reference

| Question | Answer |
|----------|--------|
| Package manager | pnpm 9.15.4 |
| Node | >= 20.11 |
| Monorepo tool | Turborepo 2 |
| Framework | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| AI SDK | Vercel AI SDK v5 (`ai` package) |
| Models | Google Vertex AI + 9-provider BYOK registry |
| DB | Postgres (Supabase) + pgvector. Drizzle ORM (50 tables) |
| Local DB | PGlite (embedded Postgres, zero setup) |
| Charts | TradingView lightweight-charts v5 |
| Tests | Vitest (173 files, 590+ cases). Playwright E2E (16 spec files). |
| Lint | ESLint flat config in `packages/config/eslint` |
| TypeScript | Strict mode. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` |

## Commands

```bash
# Development (local, zero setup — PGlite auto-boots)
pnpm dev:local              # http://localhost:3000

# Development (with remote DB)
pnpm dev                    # starts web only (turbo run dev)

# Docker (full features, pgvector included)
./docker/init-secrets.sh
docker compose up -d

# Testing
pnpm turbo run test -- --run    # all packages
pnpm --filter @hamafx/web test  # single package
pnpm --filter @hamafx/web exec playwright test  # E2E

# Typecheck & Lint
pnpm typecheck
pnpm lint

# Build
pnpm --filter @hamafx/web build

# Migrations
pnpm --filter @hamafx/db migrate:gen     # generate from schema changes
pnpm --filter @hamafx/db migrate:apply   # apply to DATABASE_URL
# Vercel prod deploys run scripts/predeploy-migrate.mjs automatically.

### Migration Rules (load-bearing — do NOT violate)

- **Never run `drizzle-kit push` against production.** It drops columns/tables not in the schema (e.g., `tenant_id` on 10 global tables, `symbol_catalog.n_data_symbol`). Always use `migrate:gen` + `migrate:apply`.
- **Never edit applied migration files.** Editing changes the SHA-256 hash, causing drizzle-kit to re-apply on the next deploy — typically failing on non-idempotent DDL. Create a NEW migration to fix issues.
- **Always use a direct connection for migrations.** Use `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` (port 5432), never the Supabase pooler (port 6543 / `DATABASE_URL`). PgBouncer in transaction mode silently drops DDL.
- **All new migrations must be idempotent.** Use `IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... IF NOT EXISTS ... $$` guards. A CI test verifies every migration can be applied twice against PGlite.
- **Run `pnpm --filter @hamafx/db migrate:status` before deploying** to check for pending migrations.
- **The tracking table is `drizzle.__drizzle_migrations`** (not `public`). The config pins `migrationsSchema: 'drizzle'`.

## Vercel CLI & Environment Variables

> The project **hamafx-ai** is deployed on Vercel (production: https://hamafx-ai.vercel.app).
> Your Vercel team is **Hama Projects** (org: `mahamad-ahmads-projects`).
> A `.vercel/project.json` at the repo root links this project automatically.

```
# Check authentication status
vercel whoami

# Pull environment variables to .env.local (works from repo root!)
vercel env pull .env.local

# Pull production env vars instead of development
vercel env pull .env.local --environment production

# Link the project (only needed on fresh clones)
cd apps/web && vercel link --project hamafx-ai --yes

# View recent request logs (may need --scope on fresh auth)
vercel logs --project hamafx-ai --scope mahamad-ahmads-projects --limit 50

# Stream live logs (use Ctrl+C to stop)
vercel logs --project hamafx-ai --scope mahamad-ahmads-projects --follow

# List recent deployments
vercel list hamafx-ai --scope mahamad-ahmads-projects
```

**Common gotchas for AI agents:**
- The `.env.local` file is **gitignored** — do NOT commit it. It contains secrets (DB creds, API keys).
- Auth tokens are stored via the Vercel CLI credential helper (not in `~/.vercel/config.json`). If auth breaks, run `vercel logout && vercel login`.
- Env vars pulled include DB creds (`POSTGRES_URL`, `POSTGRES_HOST`), Supabase (`NEXT_PUBLIC_SUPABASE_URL`), AI model config, API secrets, and Google Vertex credentials.

# AI Evals (manual, not in CI)
pnpm --filter @hamafx/ai eval -- --base-url http://localhost:3000 --cookie "authjs.session-token=..." --cases
```

## Monorepo Structure

```
HamaFX-Ai/
├── apps/
│   ├── web/              # Next.js 15 PWA (frontend + API routes)
│   └── worker/           # Node.js daemon (SignalR consumer, tick processing, job runner)
├── packages/
│   ├── ai/               # AI agent core — chat, 32 tools, routing, memory, persistence
│   ├── data/             # Market data adapters — price, candles, news, failover, caching
│   ├── db/               # Drizzle schema (50 tables) + Postgres/PGlite client
│   ├── indicators/       # Technical indicators — SMA, EMA, RSI, MACD, SMC structure
│   ├── shared/           # Zod schemas, domain types, env validation, error codes, encryption
│   ├── config/           # Shared ESLint, Prettier, TS configs (not compiled)
│   └── test-utils/       # Shared test factories, mocks, vitest helpers
├── docs/                 # Architecture + API + deployment docs (you are here)
├── infra/cron-vm/        # GCE VM setup script + systemd units
├── tools/                # Lighthouse + MT5 bridge (auxiliary tooling)
└── scripts/              # dev.ts (local dev entrypoint), predeploy-migrate.mjs
```

**Dependency chain:** `config` → `shared` → `db` + `indicators` → `data` → `ai` → `web` + `worker`

## Architecture at a Glance

```
Browser (PWA)
    │
    ├── /api/chat ──▶ runChat() ──▶ streamText + 32 tools
    │                    │
    │                    ├── routeTurn() ──▶ pick model (fundamental/technical/summary/vision)
    │                    ├── runPlanner() ──▶ plan-then-act pre-step
    │                    ├── buildLiveSnapshot() ──▶ prices, session, health
    │                    ├── compactThread() ──▶ rolling summary
    │                    ├── tryReserveBudget() ──▶ atomic budget guard
    │                    └── enforceCitations() ──▶ post-finish fact-check
    │
    ├── /api/market/* ──▶ @hamafx/data ──▶ providers (BiQuote→Finnhub failover)
    │
    └── Middleware (Edge): NextAuth JWT check, CSRF, request-id

Worker (GCE VM, systemd)
    │
    ├── SignalR consumer ──▶ TickBuffer ──▶ live_ticks (1Hz flush)
    ├── Candle1mAggregator ──▶ candles_1m (UPSERT on close)
    ├── systemd timers ──▶ 7 heavy jobs (briefings, snapshots, cot, etc.)
    └── Light HTTP pokers ──▶ Vercel /api/cron/* endpoints
```

## Key Patterns

### 1. Failover Everywhere
Data layer uses `runWithFailover([{name, run()}])` with health-aware ordering. Pinned providers (live_ticks, candles_1m) keep position. SWR = stale-while-revalidate at every level.

### 2. Atomic Budget Guard
`tryReserveBudget()`: single `INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap`. Concurrent turns at 99% cap serialize correctly.

### 3. Zod at Boundaries
Every data shape crossing package boundaries validates through `@hamafx/shared` schemas. Tool inputs → `InputSchema`, tool outputs → `ToolOutputMap`.

### 4. AsyncLocalStorage for Context
`withToolContext()` eliminates global state. Each tool call has threadId, env, signal, budget snapshot via `getToolContext()`.

### 5. Plan-Then-Act
For fundamental/technical turns: cheap model generates JSON plan, persisted as system message, rendered as "Thinking" pill in UI.

### 6. Citation Enforcement
`enforceCitations()` scans every assistant turn for unsupported price/event claims. Appends `data-citation-warning` part if model cites numbers without tool calls.

### 7. Deployment Modes
- **Local native**: PGlite (embedded Postgres), zero setup, `pnpm dev:local`
- **Local Docker**: Postgres 16 + pgvector, `./docker/init-secrets.sh && docker compose up -d`
- **Production**: Vercel (web) + GCE VM (worker), systemd timers

### 8. DB-Access Convention (DIP-1)

**Rule:** Inside `packages/ai`, resolve `db` / `llmClient` via the typed DI container tokens (`DB`, `LLM_CLIENT` from `./tokens`). Everywhere else (`apps/web`, `apps/worker`, other packages), import `getDb` directly from `@hamafx/db`.

```ts
// packages/ai — use the container
import { DB, LLM_CLIENT } from './tokens';
const db = container.resolve(DB); // typed as DbClient
const client = container.resolve(LLM_CLIENT); // typed as LlmClient

// apps/web, apps/worker — direct imports
import { getDb } from '@hamafx/db';
const db = getDb();
```

**Tokens are typed:** `DB` is `Token<DbClient>`, `LLM_CLIENT` is `Token<LlmClient>`. Use `token<T>(key)` from `@hamafx/shared` to create new ones. Never use string literals — `container.resolve<T>('db')` has no compile-time link between the string and `T`.

**Rationale:** The AI runtime benefits from injectable `db`/`llmClient` for testing long agent flows. Next.js server actions/route handlers are already the composition edge and read cleanly with direct `getDb()`. The split prevents the test-footgun where `container.register('db', …)` silently fails to intercept direct `getDb()` importers.

### 9. Deployment Modes (continued)

## File Naming Conventions

| Pattern | Example |
|---------|---------|
| `kebab-case.ts` for modules | `get-candles.ts`, `memory-index.ts` |
| `PascalCase` for React components | `ChatScreen.tsx`, `NavDrawer.tsx` |
| `_prefix.ts` for private/internal | `_extensions.ts`, `_provision.sh` |
| `.test.ts` for test files | `candle-1m.test.ts` |
| `route.ts` for API route handlers | `api/chat/route.ts` |
| `page.tsx` for Next.js pages | `(app)/chat/page.tsx` |

## Common Pitfalls

### Edge Runtime Constraints
- Middleware runs on Edge: no `postgres-js`, no `fs`, no Node APIs
- `@hamafx/db` is Node-only — never import from Edge middleware
- Auth env is split: `getAuthEnv()` (Edge-safe) vs `getServerEnv()` (full)

### PGlite vs Postgres
- PGlite runs embedded Postgres via WASM, stored in `.hamafx/data/`
- pgvector NOT available in PGlite — vector tables use `real[]` fallback
- When adding new DB features: ensure they work without pgvector
- **drizzle-orm ≥0.45.2 error wrapping:** PGlite errors thrown through drizzle are wrapped with a `"Failed query: {SQL}"` prefix. The original PGlite error is stored in `err.cause`. Any code that inspects PGlite error messages (e.g., checking for `"already exists"`, `"does not exist"`, `"cannot insert multiple commands"`) must extract the underlying message via `err instanceof Error && err.cause instanceof Error ? err.cause.message : err.message`. See `packages/db/src/pglite-client.ts` (both `executeWithFallback()` and `applyMigrations()`) and the test files `schema-drift.test.ts` / `full-migration-chain.test.ts` for the canonical pattern.

### Supabase Pooler
- Uses transaction mode: `prepare: false` on Postgres client
- Pool sizes: 5 (web), 3 (worker). Controlled via `DB_POOL_MAX` / `WORKER_DB_POOL_MAX`

### Test Commands
- Always use `-- --run` flag with vitest to avoid watch mode
- `pnpm turbo run test -- --run` runs all packages
- Individual: `pnpm --filter @hamafx/worker test -- --run`

## What NOT to Change

- **Auth flow**: NextAuth v5 (Credentials provider) with strict per-user
  `userId` scoping. Multi-tenant is load-bearing — do not regress to a
  single-password gate.
- **Middleware**: Edge runtime constraint is intentional. Don't add DB calls there.
- **Provider failover**: `runWithFailover()` pattern. Don't add direct provider calls.
- **Tool pattern**: `inputSchema → module augmentation → execute`. Don't break the tool registry.
- **AsyncLocalStorage**: tools use `getToolContext()`. Don't use global state.

## Admin Debugging & Logging

### Admin Dashboard

A dedicated `/admin` page is available for admin users. It provides a centralized debugging interface for:

- **Onboarding Control** — reset and replay the onboarding wizard (soft or full reset)
- **Cron History** — view recent cron job runs
- **Tool Telemetry** — inspect recent AI tool calls
- **Diagnostic Traces** — browse persisted chat diagnostic traces
- **User Management** — list users and their onboarding status
- **Feature Flags** — toggle runtime feature flags
- **Log Stream** — stream logs in real-time (dev only)

An **Onboarding Reset** card is also available in `/settings` for quick access.

Admin access is determined by `apps/web/src/lib/admin-auth.ts`:
- A user with `role = 'admin'` is always an admin.
- In single-user deployments (no users with `role = 'admin'`), the sole authenticated user is treated as admin for self-hosting convenience.

### Logging Upgrade

The project uses a single pino logger from `packages/shared/src/logger.ts` across both web and worker:

- **Categories** — every log line carries a `category` field (e.g., `auth`, `db`, `ai`, `cron`, `admin`)
- **Trace correlation** — `traceIdStorage` injects `traceId` automatically inside diagnostic scopes
- **Structured errors** — `logErrorContext()` enriches error logs with code, stack, file, line, cause, and error-pattern metadata
- **AI-agent-friendly logs** — `logForAgent()` produces logs with `agentLog: true` for easy filtering
- **Error patterns** — `packages/shared/src/error-patterns.ts` catalogs known failure modes with suggested fixes
- **Bug reports** — `packages/shared/src/bug-report.ts` generates redacted, AI-agent-friendly bug reports
- **Diagnostic trace persistence** — traces are saved to `diagnostic_traces` and optionally to `DEBUG_TRACE_PATH`
- **Worker migration** — `apps/worker/src/log.ts` now delegates to the shared pino logger

### Useful Admin/Debug Env Vars

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error` |
| `DEBUG_TRACE_PATH` | Optional directory to write diagnostic trace JSON files |
| `ENABLE_LOG_STREAM` | Set to `true` in dev to enable `/api/admin/logs/stream` |
| `ENABLE_IMPERSONATION` | Set to `true` in dev to enable user impersonation |

## Documentation Index

| Doc | Description |
|-----|-------------|
| [01-architecture.md](./docs/01-architecture.md) | System design, data flow diagrams, deployment topology |
| [02-codebase.md](./docs/02-codebase.md) | Package details, conventions, file map, extension rules |
| [03-ai-agent.md](./docs/03-ai-agent.md) | Agent internals, 32 tools, routing, memory, evals |
| [04-data-layer.md](./docs/04-data-layer.md) | DB schema (50 tables), providers, caching, failover |
| [05-api-routes.md](./docs/05-api-routes.md) | All 93 API routes, auth, middleware, CSRF |
| [05-security-auth-compliance.md](./docs/05-security-auth-compliance.md) | Security, auth, compliance, BYOK, billing |
| [06-frontend.md](./docs/06-frontend.md) | Pages, components, state, charts, PWA |
| [06-deployment-self-hosting.md](./docs/06-deployment-self-hosting.md) | Deployment, self-hosting, CI/CD |
| [07-worker.md](./docs/07-worker.md) | Worker daemon, SignalR, jobs, scheduler |
| [07-agent-understanding.md](./docs/07-agent-understanding.md) | Agent guide for AI coding agents |
| [08-deployment.md](./docs/08-deployment.md) | Production cloud deployment (Vercel + GCE) |
| [08-agent-setup-run.md](./docs/08-agent-setup-run.md) | Dev environment setup and startup |
| [09-testing.md](./docs/09-testing.md) | Test infrastructure, patterns, E2E, eval harness |
| [10-security.md](./docs/10-security.md) | Auth, secrets, CSRF, BYOK encryption, secrets rotation |
| [11-self-hosting.md](./docs/11-self-hosting.md) | Docker Compose self-hosting guide |
| [13-first-run-setup.md](./docs/13-first-run-setup.md) | New user onboarding, dev-secret autogen, BYOK registry |
| [15-debugging-and-tracing.md](./docs/15-debugging-and-tracing.md) | Debugging, OpenTelemetry, and request tracing |
| [e2e-testing.md](./docs/e2e-testing.md) | E2E test system architecture |
| [SETTINGS_CLEANUP.md](./docs/SETTINGS_CLEANUP.md) | Settings restructure and bug fixes |
