# AGENTS.md — Kestrel Development Guide

> **For AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, etc.) working on this repository.**
> Read this FIRST before making any changes. It is the canonical source of truth for the project.

## Project Identity

**Kestrel** is an open-source, multi-tenant, chat-driven AI trading copilot for **gold, forex, and crypto**: **XAUUSD** (primary), a canonical forex catalog, and supported Binance crypto pairs. It runs as a Next.js 16 PWA with a persistent Node.js worker daemon. The AI agent uses Vercel AI SDK v5 with 33 registered tools, domain-based model routing, and multi-agent committee deliberation.

- **License**: Apache-2.0
- **Status**: In production on Vercel + GCE VM. Phases 0–9 shipped (incl. multi-tenant v2.0). UX Upgrade Plan Phases A/B/C/D/E shipped.
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy) + Drizzle adapter. BYOK per user (10-provider registry). Strict `userId` scoping on all user-data tables.
- **Repo**: [github.com/HamaFx/Kestrel](https://github.com/HamaFx/Kestrel)

> **Auth status:** The auth system has been hardened. Features include: JWT session management, bcrypt password hashing, account lockout (5 attempts → 15 min), TOTP 2FA (enforced at login), timing-safe user enumeration prevention, signed `x-user-id` header (HMAC-SHA256) for route defense-in-depth, `userSessions` table for active session tracking with revoke support, and `tokenVersion` for "sign out everywhere". See [`auth.ts`](./apps/web/src/auth.ts) and [`auth.config.ts`](./apps/web/src/auth.config.ts) for the canonical implementation.

## Quick Reference

> Production operations note: the worker runs in Docker on the GCE VM with its internal scheduler. Host systemd timers are reserved for light Vercel pokes and maintenance. Backups are prepared for Backblaze B2 but intentionally remain skipped until the operator configures the account.


| Question | Answer |
|----------|--------|
| Package manager | pnpm 9.15.4 |
| Node | >= 22.13.0 |
| Monorepo tool | Turborepo 2 |
| Framework | Next.js 16 App Router + React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| AI SDK | Vercel AI SDK v5 (`ai` package) |
| Models | Google Vertex AI + 10-provider BYOK registry |
| DB | Postgres (Supabase) + pgvector. Drizzle ORM (50 tables across 35 schema definition files) |
| Local DB | PGlite (embedded Postgres, zero setup) |
| Charts | TradingView lightweight-charts v5 |
| Tests | Vitest (228 test files). Playwright E2E (16 spec files). |
| Lint | ESLint flat config in `packages/config/eslint` |
| TypeScript | Strict mode with `noUncheckedIndexedAccess`; the web app currently opts out of `exactOptionalPropertyTypes` for compatibility |
| AI Tools | 33 registered tool definitions in `packages/ai/src/tools/` |
| Architecture snapshot | `docs/architecture-explorer.html` + `docs/architecture-explorer.json` — static reference artifacts |
| Request proxy | 190 lines. Handles auth, CSRF, CSP, request-id |

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
pnpm --filter @kestrel/web test  # single package
pnpm --filter @kestrel/web exec playwright test  # E2E

# Typecheck & Lint
pnpm typecheck
pnpm lint

# Build
pnpm --filter @kestrel/web build
```

## Architecture snapshot

The repository keeps `docs/architecture-explorer.html` and
`docs/architecture-explorer.json` as static reference artifacts. They are
not part of the application build or runtime and are updated manually when a
refreshed architecture view is useful.

## Migrations

```bash
pnpm --filter @kestrel/db migrate:gen     # generate from schema changes
pnpm --filter @kestrel/db migrate:apply   # apply to DATABASE_URL
# Vercel prod deploys run scripts/predeploy-migrate.mjs automatically.
```

### Migration Rules (load-bearing — do NOT violate)

- **Never run `drizzle-kit push` against production.** It drops columns/tables not in the schema (e.g., `tenant_id` on 10 global tables, `symbol_catalog.n_data_symbol`). Always use `migrate:gen` + `migrate:apply`.
- **Never edit applied migration files.** Editing changes the SHA-256 hash, causing drizzle-kit to re-apply on the next deploy — typically failing on non-idempotent DDL. Create a NEW migration to fix issues.
- **Always use a direct connection for migrations.** Use `DIRECT_URL` or `POSTGRES_URL_NON_POOLING` (port 5432), never the Supabase pooler (port 6543 / `DATABASE_URL`). PgBouncer in transaction mode silently drops DDL.
- **All new migrations must be idempotent.** Use `IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... IF NOT EXISTS ... $$` guards. A CI test verifies every migration can be applied twice against PGlite.
- **Run `pnpm --filter @kestrel/db migrate:status` before deploying** to check for pending migrations.
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

```

# AI Evals (manual, not in CI)
pnpm --filter @kestrel/ai eval -- --base-url http://localhost:3000 --cookie "authjs.session-token=..." --cases
```

## Monorepo Structure

```
Kestrel/
├── apps/
│   ├── web/              # Next.js 16 PWA (frontend + API routes)
│   └── worker/           # Node.js daemon (SignalR consumer, tick processing, job runner)
├── packages/
│   ├── ai/               # AI agent core — chat, 33 registered tools, routing, memory, persistence
│   ├── data/             # Market data adapters — price, candles, news, failover, caching
│   ├── db/               # Drizzle schema (50 tables across 35 files) + Postgres/PGlite client
│   ├── indicators/       # Technical indicators — SMA, EMA, RSI, MACD, SMC structure
│   ├── shared/           # Zod schemas, domain types, env validation, error codes, encryption
│   ├── config/           # Shared ESLint, Prettier, TS configs (not compiled)
│   └── test-utils/       # Shared test factories, mocks, vitest helpers
├── tools/
│   └── lighthouse/       # Lighthouse performance audit runner
├── docs/                 # Procedural guides + static architecture snapshot
├── infra/cron-vm/        # GCE VM setup script + systemd units
├── scripts/              # dev.ts (local dev entrypoint), predeploy-migrate.mjs
```

**Dependency chain:** `config` → `shared` → `db` + `indicators` → `data` → `ai` → `web` + `worker`

## Architecture at a Glance

```
Browser (PWA)
    │
    ├── /api/chat ──▶ runChat() ──▶ streamText + 33 registered tools
    │                    │
    │                    ├── routeTurn() ──▶ pick model (fundamental/technical/summary/vision)
    │                    ├── runPlanner() ──▶ plan-then-act pre-step
    │                    ├── buildLiveSnapshot() ──▶ prices, session, health
    │                    ├── compactThread() ──▶ rolling summary
    │                    ├── tryReserveBudget() ──▶ atomic budget guard
    │                    └── enforceCitations() ──▶ post-finish fact-check
    ├── /api/market/* ──▶ @kestrel/data ──▶ providers (BiQuote→Finnhub failover)
    │
    └── Request proxy (190 lines): NextAuth JWT check, CSRF, CSP, request-id

Worker (GCE VM, Docker)
    │
    ├── SignalR consumer ──▶ TickBuffer ──▶ live_ticks (1Hz flush)
    ├── Candle1mAggregator ──▶ candles_1m (UPSERT on close)
    ├── Docker internal scheduler ──▶ heavy jobs (briefings, snapshots, cot, etc.)
    └── Host systemd timers ──▶ light Vercel /api/cron/* pokes + maintenance
```

## Key Patterns

### 1. Architecture snapshot

The checked-in HTML and JSON are intentionally a static reference snapshot.
They are useful for browsing the architecture or giving an AI agent a compact
model, but they are not generated during builds and may become stale after
substantial code changes.

### 2. Failover Everywhere

Data layer uses `runWithFailover([{name, run()}])` with health-aware ordering. Pinned providers (live_ticks, candles_1m) keep position. SWR = stale-while-revalidate at every level.

### 3. Atomic Budget Guard

`tryReserveBudget()`: single `INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap`. Concurrent turns at 99% cap serialize correctly.

### 4. Zod at Boundaries

Every data shape crossing package boundaries validates through `@kestrel/shared` schemas. Tool inputs → `InputSchema`, tool outputs → `ToolOutputMap`.

### 5. AsyncLocalStorage for Context

`withToolContext()` eliminates global state. Each tool call has threadId, env, signal, budget snapshot via `getToolContext()`.

### 6. Plan-Then-Act

For fundamental/technical turns: cheap model generates JSON plan, persisted as system message, rendered as "Thinking" pill in UI.

### 7. Citation Enforcement

`enforceCitations()` scans every assistant turn for unsupported price/event claims. Appends `data-citation-warning` part if model cites numbers without tool calls.

### 8. DB-Access Convention (DIP-1)

**Rule:** Inside `packages/ai`, resolve `db` / `llmClient` via the typed DI container tokens (`DB`, `LLM_CLIENT` from `./tokens`). Everywhere else (`apps/web`, `apps/worker`, other packages), import `getDb` directly from `@kestrel/db`.

```ts
// packages/ai — use the container
import { DB, LLM_CLIENT } from './tokens';
const db = container.resolve(DB); // typed as DbClient
const client = container.resolve(LLM_CLIENT); // typed as LlmClient

// apps/web, apps/worker — direct imports
import { getDb } from '@kestrel/db';
const db = getDb();
```

**Tokens are typed:** `DB` is `Token<DbClient>`, `LLM_CLIENT` is `Token<LlmClient>`. Use `token<T>(key)` from `@kestrel/shared` to create new ones. Never use string literals — `container.resolve<T>('db')` has no compile-time link between the string and `T`.

**Rationale:** The AI runtime benefits from injectable `db`/`llmClient` for testing long agent flows. Next.js server actions/route handlers are already the composition edge and read cleanly with direct `getDb()`. The split prevents the test-footgun where `container.register('db', …)` silently fails to intercept direct `getDb()` importers.

### 9. Content Security Policy

The request proxy sets the application's standard per-request CSP nonce. The
architecture HTML/JSON snapshot is not served by the app and has no runtime
CSP exception or deployment-specific route.

## File Naming Conventions

| Pattern | Example |
|---------|---------|
| `kebab-case.ts` for modules | `get-candles.ts`, `memory-index.ts` |
| `PascalCase` for React components | `ChatScreen.tsx`, `NavDrawer.tsx` |
| `_prefix.ts` for private/internal | `_extensions.ts`, `_provision-docker.sh` |
| `.test.ts` for test files | `candle-1m.test.ts` |
| `route.ts` for API route handlers | `api/chat/route.ts` |
| `page.tsx` for Next.js pages | `(app)/chat/page.tsx` |

## Common Pitfalls

### Request Proxy Constraints
- The proxy runs on Node.js by default: keep direct database work out of the request boundary
- `@kestrel/db` is not imported by the proxy; keep the auth/security boundary lightweight
- Auth env is split: `getAuthEnv()` (Edge-safe) vs `getServerEnv()` (full)

### PGlite vs Postgres
- PGlite runs embedded Postgres via WASM, stored in `.kestrel/data/`
- pgvector NOT available in PGlite — vector tables use `real[]` fallback
- When adding new DB features: ensure they work without pgvector
- **drizzle-orm ≥0.45.2 error wrapping:** PGlite errors thrown through drizzle are wrapped with a `"Failed query: {SQL}"` prefix. The original PGlite error is stored in `err.cause`. Any code that inspects PGlite error messages (e.g., checking for `"already exists"`, `"does not exist"`, `"cannot insert multiple commands"`) must extract the underlying message via `err instanceof Error && err.cause instanceof Error ? err.cause.message : err.message`. See `packages/db/src/pglite-client.ts` (both `executeWithFallback()` and `applyMigrations()`) and the test files `schema-drift.test.ts` / `full-migration-chain.test.ts` for the canonical pattern.

### Supabase Pooler
- Uses transaction mode: `prepare: false` on Postgres client
- Pool sizes: 5 (web), 3 (worker). Controlled via `DB_POOL_MAX` / `WORKER_DB_POOL_MAX`

### Test Commands
- Always use `-- --run` flag with vitest to avoid watch mode
- `pnpm turbo run test -- --run` runs all packages
- Individual: `pnpm --filter @kestrel/worker test -- --run`

### CSP & Nonce System
- The proxy sets a `'strict-dynamic'` CSP with a per-request nonce.
- Scripts in application routes must carry a matching `nonce` attribute.
- The architecture snapshot is documentation-only and is not copied into `public/`.

## What NOT to Change

- **Auth flow**: NextAuth v5 (Credentials provider) with strict per-user
  `userId` scoping. Multi-tenant is load-bearing — do not regress to a
  single-password gate.
- **Request proxy**: Keep the request-boundary security logic lightweight. Don't add database calls there.
- **Provider failover**: `runWithFailover()` pattern. Don't add direct provider calls.
- **Tool pattern**: `inputSchema → module augmentation → execute`. Don't break the tool registry.
- **AsyncLocalStorage**: tools use `getToolContext()`. Don't use global state.
- **Architecture snapshot**: `docs/architecture-explorer.html` and `docs/architecture-explorer.json` are informational artifacts, not runtime dependencies.

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

### Logging

The project uses a single pino logger from `packages/shared/src/logger.ts` across both web and worker:

- **Categories** — every log line carries a `category` field (e.g., `auth`, `db`, `ai`, `cron`, `admin`)
- **Trace correlation** — `traceIdStorage` injects `traceId` automatically inside diagnostic scopes
- **Structured errors** — `logErrorContext()` enriches error logs with code, stack, file, line, cause, and error-pattern metadata
- **AI-agent-friendly logs** — `logForAgent()` produces logs with `agentLog: true` for easy filtering
- **Error patterns** — `packages/shared/src/error-patterns.ts` catalogs known failure modes with suggested fixes
- **Bug reports** — `packages/shared/src/bug-report.ts` generates redacted, AI-agent-friendly bug reports
- **Diagnostic trace persistence** — traces are saved to `diagnostic_traces` and optionally to `DEBUG_TRACE_PATH`
- **Worker migration** — `apps/worker/src/log.ts` delegates to the shared pino logger

### Useful Admin/Debug Env Vars

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error` |
| `DEBUG_TRACE_PATH` | Optional directory to write diagnostic trace JSON files |
| `ENABLE_LOG_STREAM` | Set to `true` in dev to enable `/api/admin/logs/stream` |
| `ENABLE_IMPERSONATION` | Set to `true` in dev to enable user impersonation |

## Documentation Index

The project keeps procedural documentation alongside a small static architecture snapshot. The snapshot is not generated during builds and should be treated as informational.

| Artifact | Description |
|----------|-------------|
| `docs/architecture-explorer.html` | Self-contained interactive architecture snapshot |
| `docs/architecture-explorer.json` | Machine-readable architecture snapshot |

### Manual (procedural — kept because they describe HOW to do things, not WHAT exists)

| Doc | Description |
|-----|-------------|
| `docs/13-first-run-setup.md` | Step-by-step setup instructions |
| `docs/11-self-hosting.md` | Docker/self-hosting guide |
| `docs/08-deployment.md` | Deploy procedures |
| `docs/09-testing.md` | Test conventions & patterns |
| `docs/10-security.md` | Security practices & rationale |
| `docs/INCIDENT-RESPONSE.md` | Incident runbook |
| `docs/BILLING-WEBHOOK-SAFETY-GATE.md` | Operational safety procedure |
| `cleanup-audit.md` | Historical audit record |
