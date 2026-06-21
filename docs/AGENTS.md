# AGENTS.md — HamaFX-Ai Development Guide

> **For AI coding agents (Claude Code, Codex, Cursor, Hermes) working on this repository.**
> Read this FIRST before making any changes. It replaces the old scattered docs.

## Project Identity

**HamaFX-Ai** is a multi-tenant, chat-driven AI trading copilot for three forex instruments: **XAUUSD** (primary), **EURUSD**, **GBPUSD**. It runs as a Next.js 15 PWA with a persistent Node.js worker daemon. The AI agent uses Vercel AI SDK v5 with 32 tools, domain-based model routing, and multi-agent committee deliberation.

- **Status**: Phases 0-9 shipped (incl. multi-tenant v2.0). Hardening complete. UX Upgrade Plan Phases A/B/C shipped (items 1-19 done). Phase D shipped (Vertex AI BYOK + api-keys page overhaul + bulk test + per-provider usage). Phase E shipped (model picker overhaul — full provider×model catalog with per-domain defaults, /settings/models browser, regenerated chat popover). Items 20-25 parked. In production on Vercel + GCE VM.
- **Principle**: Multi-tenant via NextAuth.js v5 + Drizzle adapter. BYOK per user (9-provider registry: google, vertex, anthropic, openai, groq, mistral, openrouter, xai, deepseek). Strict userId scoping on all user-data tables.
- **License**: Apache-2.0

## Quick Reference

| Question | Answer |
|----------|--------|
| Package manager | pnpm 9.15.4 |
| Node | >= 20.11 |
| Monorepo tool | Turborepo 2 |
| Framework | Next.js 15 App Router + React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| AI SDK | Vercel AI SDK v5 (`ai` package) |
| Models | Google Vertex AI (gemini-2.5-pro/flash/flash-lite) + optional AI Gateway |
| DB | Postgres (Supabase) + pgvector. Drizzle ORM |
| Local DB | PGlite (embedded Postgres, zero setup) |
| Charts | TradingView lightweight-charts v5 |
| Tests | Vitest. 90 test files, 590 cases. `pnpm turbo run test -- --run` |
| Lint | ESLint flat config in `packages/config/eslint` |
| TypeScript | Strict mode. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` |

## Commands

```bash
# Development (local, zero setup)
pnpm dev:local              # Next.js + PGlite auto-boot, http://localhost:3000

# Development (with remote DB)
pnpm dev                    # starts web only (turbo run dev)

# Docker (full features, pgvector included)
docker compose up -d

# Testing
pnpm turbo run test -- --run    # all packages
pnpm --filter @hamafx/web test  # single package

# Typecheck
pnpm typecheck                  # all packages

# Build
pnpm --filter @hamafx/web build

# Migrations
pnpm --filter @hamafx/db migrate:gen     # generate from schema changes
pnpm --filter @hamafx/db migrate:apply   # apply to DATABASE_URL
# Vercel prod deploys run scripts/predeploy-migrate.mjs before
# next build, so prod migrations happen automatically. No manual
# step required.

# AI Evals
pnpm --filter @hamafx/ai eval -- --base-url http://localhost:3000 --cookie "hfx_auth=..." --cases

# Langfuse (LLM Observability)
docker compose up -d              # start Postgres + Langfuse
open http://localhost:3001         # Langfuse dashboard
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
│   ├── db/               # Drizzle schema (27 tables) + Postgres/PGlite client
│   ├── indicators/       # Technical indicators — SMA, EMA, RSI, MACD, SMC structure
│   ├── shared/           # Zod schemas, domain types, env validation, error codes
│   └── config/           # Shared ESLint, Prettier, TS configs (not compiled)
├── docs/                 # Architecture + API + deployment docs
├── infra/cron-vm/        # GCE VM setup script + systemd units
├── tools/                # Lighthouse + MT5 bridge (auxiliary tooling)
└── scripts/              # dev.ts (local dev entrypoint)
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
    └── Middleware (Edge): hfx_auth cookie check, CSRF, request-id

Worker (GCE VM, systemd)
    │
    ├── SignalR consumer ▶ TickBuffer ▶ live_ticks (1Hz flush)
    ├── Candle1mAggregator ▶ candles_1m (UPSERT on close)
    ├── systemd timers ▶ 7 heavy jobs (briefings, snapshots, cot, etc.)
    └── Light HTTP pokers ▶ Vercel /api/cron/* endpoints
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
- **Local Docker**: Postgres 16 + pgvector, `docker compose up`
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
- pgvector NOT available in PGlite — vector tables (`memory_embeddings`, `news_embeddings`) use `real[]` fallback
- When adding new DB features: ensure they work without pgvector

### Supabase Pooler
- Uses transaction mode: `prepare: false` on Postgres client
- Pool sizes: 5 (web), 3 (worker). Controlled via `DB_POOL_MAX` / `WORKER_DB_POOL_MAX`

### Workspace Dependencies
- All workspace packages use `workspace:*` in package.json
- Next.js `transpilePackages` includes all workspace packages
- Worker uses esbuild for bundling, not Next.js

### Test Commands
- Always use `-- --run` flag with vitest to avoid watch mode
- `pnpm turbo run test -- --run` runs all packages
- Individual: `pnpm --filter @hamafx/worker test -- --run`

### Langfuse Tracing
- Self-hosted at http://localhost:3001 (docker compose up)
- Tracing is OPTIONAL — when LANGFUSE_* env vars are unset, the app
  boots normally with no tracing overhead.
- API keys are created in the Langfuse UI after first boot (Settings → API Keys)
- The AI SDK auto-emits OTel spans — no manual instrumentation needed.
- Coexists with Sentry: Sentry uses its own SDK, Langfuse uses OTel.

## What NOT to Change

- **Auth flow**: NextAuth v5 (Credentials provider) with strict per-user
  `userId` scoping on all user-data tables. Multi-tenant is now load-bearing
  — do not regress to a single-password gate. New OAuth providers or RLS
  would require a Phase plan; ask before adding.
- **Middleware**: Edge runtime constraint is intentional. Don't add DB calls there.
- **Provider failover**: `runWithFailover()` pattern. Don't add direct provider calls.
- **Tool pattern**: `inputSchema → module augmentation → execute`. Don't break the tool registry.
- **AsyncLocalStorage**: tools use `getToolContext()`. Don't use global state.

## Further Reading

- `docs/01-architecture.md` — system design, data flow diagrams
- `docs/02-codebase.md` — package details, conventions, file map
- `docs/03-ai-agent.md` — agent internals, tools, routing, memory, evals
- `docs/04-data-layer.md` — DB schema, providers, caching, failover
- `docs/05-api-routes.md` — all API endpoints, auth, middleware
- `docs/06-frontend.md` — pages, components, state, charts, PWA
- `docs/07-worker.md` — worker daemon, SignalR, jobs, scheduler
- `docs/08-deployment.md` — production cloud deployment (Vercel + GCE)
- `docs/09-testing.md` — test infrastructure, patterns
- `docs/10-security.md` — auth, secrets, CSRF, middleware
- `docs/14-first-run-setup.md` — new user onboarding, dev-secret autogen, BYOK registry
- `docs/15-motion-conventions.md` — animation conventions (motion-safe: convention for decorative, useReducedMotion for functional)
- `docs/USER_FLOW.md` — comprehensive user flow reference (sections 1-7)
- `docs/UX_UPGRADE_PLAN.md` — 25-item UX plan, status table at the top