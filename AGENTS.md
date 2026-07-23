# AGENTS.md — HamaFX-Ai Development Guide

> **For AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, etc.) working on this repository.**
> Read this FIRST before making any changes. It is the canonical source of truth for the project.

## Project Identity

**HamaFX-Ai** is an open-source, multi-tenant, chat-driven AI trading copilot for forex instruments: **XAUUSD** (primary), **EURUSD**, **GBPUSD**. It runs as a Next.js 15 PWA with a persistent Node.js worker daemon. The AI agent uses Vercel AI SDK v5 with 33 tools, domain-based model routing, and multi-agent committee deliberation.

- **License**: Apache-2.0
- **Status**: In production on Vercel + GCE VM. Phases 0–9 shipped (incl. multi-tenant v2.0). UX Upgrade Plan Phases A/B/C/D/E shipped. Architecture Explorer deployed (Phase 8 complete).
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy) + Drizzle adapter. BYOK per user (9-provider registry). Strict `userId` scoping on all user-data tables.
- **Repo**: [github.com/HamaFx/HamaFX-Ai](https://github.com/HamaFx/HamaFX-Ai)
- **Architecture Vault (Obsidian)**: [github.com/HamaFx/hamafx-architecture-vault](https://github.com/HamaFx/hamafx-architecture-vault)

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
| DB | Postgres (Supabase) + pgvector. Drizzle ORM (50 tables across 35 schema definition files) |
| Local DB | PGlite (embedded Postgres, zero setup) |
| Charts | TradingView lightweight-charts v5 |
| Tests | Vitest (228 test files). Playwright E2E (16 spec files). |
| Lint | ESLint flat config in `packages/config/eslint` |
| TypeScript | Strict mode. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` |
| AI Tools | 33 exported tool definitions in `packages/ai/src/tools/` |
| Architecture Explorer | `tools/architecture-explorer/` — auto-generates interactive HTML, JSON model, Obsidian vault, and AI knowledge artifacts |
| Middleware | 190 lines. Edge runtime. Handles auth, CSRF, CSP, request-id |

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

## Architecture Explorer Commands

# Scan the project and generate ALL artifacts (HTML, JSON, Obsidian vault, knowledge)
cd tools/architecture-explorer
npx tsx src/index.ts --root /path/to/HamaFX-Ai

# Outputs (regenerated every run):
#   docs/architecture-explorer.html     — Interactive graph explorer
#   docs/architecture-explorer.json     — Full architecture model (1,399+ nodes)
#   docs/obsidian/                      — Obsidian vault (1,343+ files)
#   docs/knowledge/                     — 8 AI knowledge artifacts

# Typecheck the explorer tool separately
cd tools/architecture-explorer && npx tsc --noEmit

## Migrations
pnpm --filter @hamafx/db migrate:gen     # generate from schema changes
pnpm --filter @hamafx/db migrate:apply   # apply to DATABASE_URL
# Vercel prod deploys run scripts/predeploy-migrate.mjs automatically.
```

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

```

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
│   ├── ai/               # AI agent core — chat, 33 tools, routing, memory, persistence
│   ├── data/             # Market data adapters — price, candles, news, failover, caching
│   ├── db/               # Drizzle schema (50 tables across 35 files) + Postgres/PGlite client
│   ├── indicators/       # Technical indicators — SMA, EMA, RSI, MACD, SMC structure
│   ├── shared/           # Zod schemas, domain types, env validation, error codes, encryption
│   ├── config/           # Shared ESLint, Prettier, TS configs (not compiled)
│   └── test-utils/       # Shared test factories, mocks, vitest helpers
├── tools/
│   ├── architecture-explorer/  # 16 source files — auto-generates interactive graphs + artifacts
│   └── lighthouse/       # Lighthouse performance audit runner
├── docs/                 # Only procedural docs (auto-generated docs moved to docs/knowledge/)
│   ├── knowledge/        # 8 AI knowledge artifacts (machine-readable JSON + markdown)
│   └── obsidian/         # Auto-generated Obsidian vault (1,343+ files, open as vault)
├── infra/cron-vm/        # GCE VM setup script + systemd units
├── scripts/              # dev.ts (local dev entrypoint), predeploy-migrate.mjs
```

**Dependency chain:** `config` → `shared` → `db` + `indicators` → `data` → `ai` → `web` + `worker`

## Architecture at a Glance

```
Browser (PWA)
    │
    ├── /api/chat ──▶ runChat() ──▶ streamText + 33 tools
    │                    │
    │                    ├── routeTurn() ──▶ pick model (fundamental/technical/summary/vision)
    │                    ├── runPlanner() ──▶ plan-then-act pre-step
    │                    ├── buildLiveSnapshot() ──▶ prices, session, health
    │                    ├── compactThread() ──▶ rolling summary
    │                    ├── tryReserveBudget() ──▶ atomic budget guard
    │                    └── enforceCitations() ──▶ post-finish fact-check
    │
    ├── /api/admin/architecture-explorer ──▶ Serves interactive architecture graph
    │                                          (admin-only, public/architecture-explorer.html)
    ├── /api/market/* ──▶ @hamafx/data ──▶ providers (BiQuote→Finnhub failover)
    │
    └── Middleware (Edge, 190 lines): NextAuth JWT check, CSRF, CSP, request-id

Worker (GCE VM, systemd)
    │
    ├── SignalR consumer ──▶ TickBuffer ──▶ live_ticks (1Hz flush)
    ├── Candle1mAggregator ──▶ candles_1m (UPSERT on close)
    ├── systemd timers ──▶ 7 heavy jobs (briefings, snapshots, cot, etc.)
    └── Light HTTP pokers ──▶ Vercel /api/cron/* endpoints
```

## Key Patterns

### 1. Architecture Explorer — Auto-Generated Documentation

The project has a self-contained architecture explorer at `tools/architecture-explorer/`. Run it to generate up-to-date documentation from the live codebase — NO manual docs to maintain.

```bash
cd tools/architecture-explorer && npx tsx src/index.ts --root /path/to/HamaFX-Ai
```

It generates **4 types of output** simultaneously:

| Output | Location | Size | Purpose |
|--------|----------|------|---------|
| Interactive HTML | `docs/architecture-explorer.html` | ~1.5 MB | Full interactive graph with 17+ views, zoom, search, filters |
| Machine Model | `docs/architecture-explorer.json` | ~2.1 MB | Complete architecture model (1,399+ nodes, 4,200+ edges) |
| AI Knowledge | `docs/knowledge/*.json` + `knowledge.md` | ~200 KB | 8 ready-made artifacts for AI agents (see section below) |
| Obsidian Vault | `docs/obsidian/` | ~6.5 MB | 1,343+ markdown files with wiki-links, config, and Canvas |

### 2. AI Knowledge Artifacts (for AI agents)

These files at `docs/knowledge/` are specifically designed for AI agents to understand the project without scanning the full codebase. Give these to any AI agent that needs project context:

| File | Tokens | Content |
|------|--------|---------|
| `knowledge.md` | ~2.5K | Human-readable project overview |
| `architecture.json` | ~7K | Layers, patterns, dependency chain |
| `features.json` | ~0.8K | 12 features with module ownership |
| `api.json` | ~14K | All API routes |
| `database.json` | ~13K | All DB tables |
| `ai.json` | ~2K | 33 tools, 4 agents, routing |
| `dependencies.json` | ~5K | Package dependencies |
| `flows.json` | ~1.5K | 4 sequence diagrams |

**Recommendation:** For most AI agents, just give `knowledge.md` + `architecture.json` + `api.json` + `ai.json` (~25K tokens) — covers 90% of what an agent needs.

### 3. Failover Everywhere

Data layer uses `runWithFailover([{name, run()}])` with health-aware ordering. Pinned providers (live_ticks, candles_1m) keep position. SWR = stale-while-revalidate at every level.

### 4. Atomic Budget Guard

`tryReserveBudget()`: single `INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap`. Concurrent turns at 99% cap serialize correctly.

### 5. Zod at Boundaries

Every data shape crossing package boundaries validates through `@hamafx/shared` schemas. Tool inputs → `InputSchema`, tool outputs → `ToolOutputMap`.

### 6. AsyncLocalStorage for Context

`withToolContext()` eliminates global state. Each tool call has threadId, env, signal, budget snapshot via `getToolContext()`.

### 7. Plan-Then-Act

For fundamental/technical turns: cheap model generates JSON plan, persisted as system message, rendered as "Thinking" pill in UI.

### 8. Citation Enforcement

`enforceCitations()` scans every assistant turn for unsupported price/event claims. Appends `data-citation-warning` part if model cites numbers without tool calls.

### 9. DB-Access Convention (DIP-1)

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

### 10. Obsidian Vault for Architecture Browsing

The auto-generated Obsidian vault at `docs/obsidian/` contains 1,343+ markdown files with YAML frontmatter and wiki-links. Open it as an Obsidian vault:

- **Graph View**: 1,401 nodes, 4,220 edges, color-coded by type and layer
- **12 dashboards**: Top connected nodes, risk distribution, package heatmap, hotspots, circular deps
- **16 Package MOCs**: Per-package Maps of Content
- **Architecture Canvas**: Interactive package dependency diagram
- **Pre-configured**: `.obsidian/` with graph colors, CSS snippets, core plugins
- **Standalone repo**: [github.com/HamaFx/hamafx-architecture-vault](https://github.com/HamaFx/hamafx-architecture-vault) for iOS sync via Obsidian Git plugin

### 11. Deployment Preview: Architecture Explorer on Vercel

The interactive architecture explorer is served at `/api/admin/architecture-explorer` (admin auth required). The HTML file is:
- Generated by `tools/architecture-explorer/`
- Copied to `apps/web/public/` by `scripts/predeploy-migrate.mjs` during Vercel builds
- Served by the route handler with custom CSP (allows inline scripts)
- Also directly accessible at `https://hamafx-ai.vercel.app/architecture-explorer.html` (no auth — the repo is public)

### 12. Middleware CSP & Architecture Explorer Exception

The middleware at `apps/web/src/middleware.ts` (190 lines, Edge runtime) sets a `Content-Security-Policy` with `'strict-dynamic'` and a per-request nonce. The architecture explorer route is explicitly **exempted** from this CSP at line 174 — the route handler sets its own permissive CSP instead, because the explorer's inline scripts don't carry the middleware nonce.

The middleware matcher excludes these paths from processing:
- `auth`, `share`, `api/auth/*`, `api/dev/login`, `api/cron/*`, `api/telegram/*`, `api/billing/webhook/*`
- `debug`, `sw.js`, `sw-precache.json`, `_next/*`, `favicon.ico`, `manifest.webmanifest`
- `icons`, `robots.txt`, `sitemap.xml`, `d3.v7.min.js`

> **Regex note:** In the TypeScript matcher regex at `apps/web/src/middleware.ts`, dots in paths like `d3\.v7\.min\.js` use `\\.` because of double-escaping: the TS string literal escape turns `\\.` into `\.` in the regex, which matches a literal dot. When editing the matcher, follow the same convention as existing entries.

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

### CSP & Nonce System
- The middleware sets a `'strict-dynamic'` CSP with a per-request nonce
- Scripts must have a matching `nonce` attribute to execute
- The architecture explorer is SKIPPED by this CSP (its inline scripts don't carry the nonce)
- Instead, its route handler sets a permissive CSP: `script-src 'self' 'unsafe-inline'`
- If adding a new route with inline scripts, either: (a) use the middleware nonce, or (b) skip CSP for that route
- The static file `/d3.v7.min.js` is excluded from middleware processing entirely

### Predeploy Copy Behavior
- `scripts/predeploy-migrate.mjs` copies `docs/architecture-explorer.html` to `apps/web/public/` during Vercel builds
- The `public/` directory is guaranteed to be available in Vercel serverless functions
- On first run or after a fresh clone, `apps/web/public/architecture-explorer.html` won't exist until the architecture explorer is generated
- The route handler returns a 404 fallback if the file is missing (not a crash)

## What NOT to Change

- **Auth flow**: NextAuth v5 (Credentials provider) with strict per-user
  `userId` scoping. Multi-tenant is load-bearing — do not regress to a
  single-password gate.
- **Middleware**: Edge runtime constraint is intentional. Don't add DB calls there.
- **Provider failover**: `runWithFailover()` pattern. Don't add direct provider calls.
- **Tool pattern**: `inputSchema → module augmentation → execute`. Don't break the tool registry.
- **AsyncLocalStorage**: tools use `getToolContext()`. Don't use global state.
- **Architecture Explorer generators**: These are the source of truth for project documentation. If you need to update project docs, update the generator code, not the generated output files.

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
- **Architecture Explorer** — link to the interactive graph explorer at `/api/admin/architecture-explorer`

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

The project uses **auto-generated documentation** wherever possible. Manual docs are kept only for procedural information that cannot be derived from code.

### Auto-Generated (run `cd tools/architecture-explorer && npx tsx src/index.ts --root ..`)

| Artifact | Description |
|----------|-------------|
| `docs/architecture-explorer.html` | Interactive D3.js graph explorer with 17+ architecture views |
| `docs/architecture-explorer.json` | Full machine-readable architecture model (1,399+ nodes, 4,200+ edges) |
| `docs/knowledge/knowledge.md` | Human-readable project overview (~2.5K tokens) |
| `docs/knowledge/architecture.json` | Layers, patterns, dependency chain (~7K tokens) |
| `docs/knowledge/features.json` | 12 features with module ownership |
| `docs/knowledge/api.json` | All API routes (~14K tokens) |
| `docs/knowledge/database.json` | All DB tables (~13K tokens) |
| `docs/knowledge/ai.json` | 33 tools, 4 agents, routing |
| `docs/knowledge/dependencies.json` | Package dependencies |
| `docs/knowledge/flows.json` | Sequence diagrams |
| `docs/obsidian/` | Full Obsidian vault (1,343+ files, pre-configured) |

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
| `docs/audit/solid-findings.md` | Historical audit record |
