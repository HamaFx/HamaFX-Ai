# 01 — Project Overview

## Executive Summary

**HamaFX-Ai** is a production-quality, open-source, multi-tenant chat-driven AI trading copilot for forex instruments (XAUUSD, EURUSD, GBPUSD). It runs as a Next.js 15 PWA with a persistent Node.js worker daemon, leveraging Vercel AI SDK v5 with 32 AI tools, domain-based model routing, and multi-agent committee deliberation.

**Architecture Score: 8.1/10** — Strong foundation with intentional design patterns, but several areas need refactoring for long-term maintainability.

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

## Monorepo Structure

```
HamaFX-Ai/
├── apps/
│   ├── web/              # Next.js 15 PWA (frontend + API routes)
│   └── worker/           # Node.js daemon (SignalR consumer, tick processing, job runner)
├── packages/
│   ├── ai/               # AI agent core — chat, 32 tools, routing, memory, persistence
│   ├── data/             # Market data adapters — price, candles, news, failover, caching
│   ├── db/               # Drizzle schema (50+ tables) + Postgres/PGlite client
│   ├── indicators/       # Technical indicators — SMA, EMA, RSI, MACD, SMC structure
│   ├── shared/           # Zod schemas, domain types, env validation, error codes, encryption
│   ├── config/           # Shared ESLint, Prettier, TS configs (not compiled)
│   └── test-utils/       # Shared test factories, mocks, vitest helpers
├── docs/                 # Architecture + API + deployment docs
├── infra/cron-vm/        # GCE VM setup script + systemd units
└── scripts/              # dev.ts (local dev entrypoint), predeploy-migrate.mjs
```

## Dependency Chain

```
config → shared → db + indicators → data → ai → web + worker
```

This is a well-designed unidirectional dependency flow. No circular package dependencies exist, which is a strong architectural achievement.

## Key Design Patterns in Use

| Pattern | Location | Quality |
|---------|----------|---------|
| **Strategy** | `MODEL_ROUTER` in `packages/ai/src/model.ts` | ✅ Excellent |
| **Factory** | `_providers/` factory functions, `vertex-factory.ts` | ✅ Good |
| **Registry** | `toolRegistry`, `BYOK_PROVIDERS`, `MARKET_DATA_PROVIDERS` | ✅ Good |
| **Adapter** | `packages/data/src/adapters/` (price, candles, news, calendar) | ✅ Good |
| **Failover** | `runWithFailover()` in `packages/data/src/failover.ts` | ✅ Excellent |
| **Repository** | `packages/db/src/queries/` pattern | ✅ Good |
| **Template Method** | `BaseAgent` in `packages/ai/src/multi-agent/agents/base-agent.ts` | ✅ Good |
| **Observer** | `SymbolManager` event system in `apps/worker/src/symbol-manager.ts` | ✅ Solid |
| **State** | `ThreadStateHandler` in `packages/ai/src/thread-state.ts` | ✅ Good |
| **Specification/Composite** | `AlertSpec` in `packages/ai/src/alerts/spec.ts` | ✅ Excellent |
| **Command** | `BotCommand` system in `packages/ai/src/bot/` | ✅ Good |
| **Service Layer** | `apps/web/src/lib/services/` | ⚠️ Partial |
| **Dependency Injection** | `getLlmClient/setLlmClient`, `AsyncLocalStorage` for tools | ⚠️ Partial |
| **Job Registry (PF-04)** | `apps/worker/src/jobs/index.ts` — `JOBS` record | ✅ Excellent |
| **Tool Category System** | `tools/market.ts`, `analysis.ts`, `journal.ts`, `system.ts` | ✅ Good |
| **Mutation Guard** | `packages/ai/src/tools/mutation-guard.ts` | ✅ Good |
| **Domain Tool Filter** | `packages/ai/src/tools/by-domain.ts` | ✅ Good |

## Technology Stack

- **Framework**: Next.js 15 App Router + React 19
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix)
- **AI SDK**: Vercel AI SDK v5 (`ai` package)
- **Models**: Google Vertex AI + 9-provider BYOK registry
- **DB**: Postgres (Supabase) + pgvector. Drizzle ORM (50+ tables)
- **Local DB**: PGlite (embedded Postgres, zero setup)
- **Charts**: TradingView lightweight-charts v5
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy)
- **Testing**: Vitest (173 files, 590+ cases). Playwright E2E (16 spec files)
- **Package Manager**: pnpm 9.15.4, Turborepo 2

## Architectural Strengths

1. **Clean package dependency chain**: config → shared → db + indicators → data → ai → web + worker. No cycles.
2. **Zod at every boundary**: All data crossing package boundaries validates through schemas in `@hamafx/shared`.
3. **Multi-layer failover**: `runWithFailover()` with health-aware ordering, provider pinning, and SWR caching.
4. **Atomic budget guard**: `tryReserveBudget()` uses Postgres row-level serialization for correct concurrent budgeting.
5. **AsyncLocalStorage for context**: `withToolContext()` eliminates global state for concurrent tool execution.
6. **Plan-then-act**: Cheap model pre-step generates a JSON plan for analytical turns.
7. **Citation enforcement**: Post-finish fact-check on unsupported price/event claims.
8. **Extensive test coverage**: 590+ Vitest cases, 16 Playwright spec files, load testing infrastructure.
9. **ESLint-enforced architecture**: Custom rules prevent direct domain package imports from route handlers (PF-22).

## Architectural Weaknesses (Summary)

1. **God file: agent.ts** — 918 lines orchestrating budget, history, routing, streaming, telemetry, auto-title, and citation enforcement.
2. **Service layer is a thin pass-through**: `apps/web/src/lib/services/*` files mostly do `as unknown as DTO` casts with no actual business logic.
3. **Switch statements scattered**: Indicator registry, alert evaluator, timeframe mappers — all require modification when adding new variants.
4. **Limited dependency injection**: Direct DB access via `getDb()` in tool files and agent.ts bypasses repository abstraction.
5. **`as unknown as` type casts**: 29+ instances across the codebase, particularly in service layer files and multi-agent orchestrator.
6. **React components contain data fetching**: Direct `fetch()` calls in components like `chat-screen.tsx`, `composer.tsx`, `wizard.tsx`.
7. **Shared mutable state**: 14+ global singletons (`_client`, `_sql`, `_replicaClient`, `_replicaSql`, `_adminClient`, `_adminSql`, `_pglite`, `_db`, `_defaultClient`, `_dispatcher`, `_instance`, `_sdk`, `_tenantCaches`, `_runningJobs`) without centralized lifecycle management.
8. **Inconsistent interface segregation**: Some interfaces like `SharedContext` carry 13+ properties. `ToolContext` has 8 properties with mixed concerns.

## File Size Distribution

| File | Lines (est.) | Package | Concern |
|------|-------------|---------|---------|
| `agent.ts` | 918 | ai | Too large — model selection, budget, history, streaming, telemetry |
| `model.ts` | 762 | ai | Large but focused — acceptable for model resolution |
| `orchestrator.ts` | 280 | ai | Reasonable for multi-agent pipeline |
| `index.ts` (worker) | 530 | worker | Large — worker lifecycle + SignalR + Binance + persistence |
| `routing.ts` | 280 | ai | Good size, focused on turn classification |
| `client.ts` (db) | 200 | db | Good size, focused on DB connection management |
| `composer.tsx` | 623 | web | Large — voice input, slash commands, image upload, send logic |

## Migration & Schema Management

- **54 migration files** in `packages/db/drizzle/` (from `0000_lazy_red_shift.sql` to `0060_provider_health.sql`)
- Strong migration discipline: idempotent migrations, no `drizzle-kit push` against production
- Migrations reviewed before deployment via CI test
- Tracking table: `drizzle.__drizzle_migrations`

---

*Report generated as part of the comprehensive SOLID architecture audit of HamaFX-Ai.*
