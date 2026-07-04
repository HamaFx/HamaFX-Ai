# AGENTS.md — HamaFX-Ai Development Guide

> **For AI coding agents (Claude Code, Codex, Cursor, Gemini CLI, etc.) working on this repository.**
> Read this FIRST before making any changes. It is the canonical source of truth for the project.

## Project Identity

**HamaFX-Ai** is an open-source, multi-tenant, chat-driven AI trading copilot for forex instruments: **XAUUSD** (primary), **EURUSD**, **GBPUSD**. It runs as a Next.js 15 PWA with a persistent Node.js worker daemon. The AI agent uses Vercel AI SDK v5 with 32 tools, domain-based model routing, and multi-agent committee deliberation.

- **License**: Apache-2.0
- **Status**: In production on Vercel + GCE VM. Phases 0–9 shipped (incl. multi-tenant v2.0). UX Upgrade Plan Phases A/B/C/D/E shipped.
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy) + Drizzle adapter. BYOK per user (9-provider registry). Strict `userId` scoping on all user-data tables.
- **Repo**: [github.com/HamaFx/HamaFX-Ai](https://github.com/HamaFx/HamaFX-Ai)

> **Known issue:** The auth system has critical security bugs. See [`AUTH_FIX_PLAN.md`](./AUTH_FIX_PLAN.md) (not yet written — auth guidance in this file is current) for the full fix plan before touching auth code.

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
| DB | Postgres (Supabase) + pgvector. Drizzle ORM |
| Local DB | PGlite (embedded Postgres, zero setup) |
| Charts | TradingView lightweight-charts v5 |
| Tests | Vitest (90+ files, 590+ cases). Playwright E2E. |
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
│   ├── db/               # Drizzle schema (40 tables) + Postgres/PGlite client
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
  single-password gate. See `AUTH_FIX_PLAN.md` (planned, not yet written) for known auth issues.
- **Middleware**: Edge runtime constraint is intentional. Don't add DB calls there.
- **Provider failover**: `runWithFailover()` pattern. Don't add direct provider calls.
- **Tool pattern**: `inputSchema → module augmentation → execute`. Don't break the tool registry.
- **AsyncLocalStorage**: tools use `getToolContext()`. Don't use global state.

## Documentation Index

| Doc | Description |
|-----|-------------|
| [01-architecture.md](./docs/01-architecture.md) | System design, data flow diagrams, deployment topology |
| [02-codebase.md](./docs/02-codebase.md) | Package details, conventions, file map, extension rules |
| [03-ai-agent.md](./docs/03-ai-agent.md) | Agent internals, 32 tools, routing, memory, evals |
| [04-data-layer.md](./docs/04-data-layer.md) | DB schema (40 tables), providers, caching, failover |
| [05-api-routes.md](./docs/05-api-routes.md) | All 37+ API endpoints, auth, middleware, CSRF |
| [06-frontend.md](./docs/06-frontend.md) | Pages, components, state, charts, PWA |
| [07-worker.md](./docs/07-worker.md) | Worker daemon, SignalR, jobs, scheduler |
| [08-deployment.md](./docs/08-deployment.md) | Production cloud deployment (Vercel + GCE) |
| [09-testing.md](./docs/09-testing.md) | Test infrastructure, patterns, E2E, eval harness |
| [10-security.md](./docs/10-security.md) | Auth, secrets, CSRF, BYOK encryption, secrets rotation |
| [11-self-hosting.md](./docs/11-self-hosting.md) | Docker Compose self-hosting guide |
| [13-first-run-setup.md](./docs/13-first-run-setup.md) | New user onboarding, dev-secret autogen, BYOK registry |
| [15-debugging-and-tracing.md](./docs/15-debugging-and-tracing.md) | Debugging, OpenTelemetry, and request tracing |
| [AUTH_FIX_PLAN.md](./AUTH_FIX_PLAN.md) | Auth system fix plan (critical bugs + improvements) — not yet written |
