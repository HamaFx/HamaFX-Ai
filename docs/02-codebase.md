# 02 — Codebase Architecture & Conventions

Comprehensive reference for the HamaFX-Ai monorepo: structure, every package and app, tooling, conventions, and rules for AI agents extending the codebase.

---

## Table of Contents

1. [Monorepo Overview](#monorepo-overview)
2. [Root Tooling](#root-tooling)
3. [Dependency Chain](#dependency-chain)
4. [Packages](#packages)
   - [config](#packagesconfig)
   - [shared](#packagesshared)
   - [db](#packagesdb)
   - [indicators](#packagesindicators)
   - [data](#packagesdata)
   - [ai](#packagesai)
   - [test-utils](#packagestest-utils)
5. [Apps](#apps)
   - [web](#appsweb)
   - [worker](#appsworker)
6. [Conventions](#conventions)
   - [Naming & Files](#naming--files)
   - [Exports & Barrels](#exports--barrels)
   - [TypeScript](#typescript)
   - [Validation & Boundaries](#validation--boundaries)
   - [Database](#database)
   - [Error Handling](#error-handling)
   - [Context & State](#context--state)
   - [Observability](#observability)
7. [AI Agent Extension Rules](#ai-agent-extension-rules)
   - [Hard Constraints](#hard-constraints)
   - [Data Source Integration](#data-source-integration)
   - [Tool Creation](#tool-creation)
   - [Schema Changes](#schema-changes)
   - [Testing Requirements](#testing-requirements)

---

## Monorepo Overview

| Aspect | Value |
|---|---|
| Package manager | pnpm 9 |
| Build orchestrator | Turborepo 2 |
| Node.js | 20+ |
| TypeScript | Strict mode throughout |
| Workspace root | Your local clone path |

```
HamaFX-Ai/
├── apps/
│   ├── web/              # Next.js 15 frontend
│   └── worker/           # Node.js background daemon
├── packages/
│   ├── config/           # Shared ESLint, Prettier, TS configs
│   ├── shared/           # Domain types, Zod schemas, env, error codes
│   ├── db/               # Drizzle ORM, schema, migrations
│   ├── indicators/       # Pure TS technical indicators + SMC
│   ├── data/             # Provider adapters, caching, failover
│   ├── ai/               # Chat orchestration, tools, RAG, evals
│   └── test-utils/       # Shared test factories, mocks, vitest helpers
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json
└── package.json
```

---

## Root Tooling

### pnpm Workspace

Packages and apps are declared in `pnpm-workspace.yaml`. The `packages/*` and `apps/*` globs capture all workspaces.

### Turborepo

`turbo.json` defines the pipeline. Common tasks:

- `build` — runs in dependency order across packages and apps
- `lint` — ESLint across all workspaces
- `typecheck` — `tsc --noEmit` across all workspaces
- `test` — vitest across all packages
- `dev` — parallel dev servers for web + worker

### TypeScript

Root `tsconfig.json` extends `@hamafx/config/tsconfig/base.json`. Individual packages and apps may further extend `nextjs.json` or `node.json` as appropriate.

---

## Dependency Chain

Packages form a strict directed acyclic graph. No circular dependencies are permitted.

```
config
  └── shared
        ├── db
        │     └── data
        │           └── ai
        │                 ├── web
        │                 └── worker
        └── indicators
              └── data
```

- `config` is dependency-free (only dev config files).
- `shared` depends only on `config` (for TypeScript).
- `db` depends on `shared` for domain types and validation.
- `indicators` depends on `shared` for types.
- `data` depends on `db` (persistence) and `indicators` (computed fields).
- `ai` depends on `data` (provider access), `db`, and `shared`.
- `web` and `worker` depend on `ai` for all domain logic.
- `test-utils` provides shared test factories (users, threads, candles) and mocks (db, fetch, llm, server-only) used across all packages.

**Rule:** No package may import from a package further "upstream" (to the right) in this chain.

---

## Packages

### packages/config

**Purpose:** Single source of truth for all linting, formatting, and TypeScript configuration.

**Contents:**

| File | Purpose |
|---|---|
| `eslint.config.mjs` | ESLint flat config (ESLint 9) |
| `prettier.config.mjs` | Prettier rules |
| `tsconfig/base.json` | Base TS strict config for all packages |
| `tsconfig/nextjs.json` | Extends base; adds JSX, bundler module resolution |
| `tsconfig/node.json` | Extends base; targets Node 20 ESM |

**Key rules:**
- `strict: true` always
- `noUncheckedIndexedAccess: true`
- `moduleResolution: "bundler"` for Next.js; `"nodenext"` for Node packages
- ESLint: `@typescript-eslint` strict-type-checked, no unused vars, no explicit any without justification

---

### packages/shared

**Purpose:** Domain types, validation schemas, environment config, and error taxonomy. Zero runtime dependencies beyond `zod`.

**Directory structure:**

```
shared/
├── src/
│   ├── schemas/          # 18+ Zod schema files (+ tool-outputs/)
│   │   ├── market.ts     # Symbol, Timeframe, OHLCV, Tick
│   │   ├── indicator.ts  # Indicator configs, SMC types
│   │   ├── agent.ts      # Chat messages, tool calls, briefings
│   │   ├── admin.ts      # User, auth, role schemas
│   │   └── ...
│   ├── ai/               # AI tool names registry + I/O schemas
│   ├── env.ts            # Environment variable validation (T3 Env)
│   ├── errors.ts         # Error code enum and taxonomy
│   └── index.ts          # Barrel re-export
```

**Symbols:**

| Symbol | Description |
|---|---|
| `XAUUSD` | Gold spot |
| `EURUSD` | Euro / US Dollar |
| `GBPUSD` | British Pound / US Dollar |

**Timeframes (exported as const array):**

| Code | Label |
|---|---|
| `1m` | 1 Minute |
| `5m` | 5 Minutes |
| `15m` | 15 Minutes |
| `30m` | 30 Minutes |
| `1h` | 1 Hour |
| `4h` | 4 Hours |
| `1d` | Daily |
| `1w` | Weekly |

**Tool Names Registry:**

A string literal union type `ToolName` enumerating all 32 AI tools registered in `@hamafx/ai`. This is the canonical list — adding a tool in `@hamafx/ai` requires adding its name here.

**Environment (env.ts):**

Uses `@t3-oss/env-core` + Zod. Validates at startup. Covers:

- `DATABASE_URL` (Postgres connection string)
- `BIQUOTE_BASE_URL` (keyless), `FINNHUB_API_KEY`, `MARKETAUX_API_KEY`, `FRED_API_KEY`
- `CFTC_API_KEY`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `SENTRY_DSN`
- `HEALTHCHECKS_URL`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (model providers)
- `PGLITE_DATA_DIR` (local dev DB path)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (Authentication)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (OAuth)
- `ENCRYPTION_SECRET`
- Feature flags: `MULTI_USER_ENABLED`, `BYOK_ENABLED`, `UNLIMITED_SYMBOLS`, `PER_USER_BRIEFINGS`

All env vars must be strictly validated in `packages/shared/src/env.ts`.

**Error Codes:**

Centralized error code enum covering:
- `VALIDATION_ERROR`
- `PROVIDER_UNAVAILABLE`
- `RATE_LIMITED`
- `TOOL_EXECUTION_ERROR`
- `MODEL_ROUTING_ERROR`
- `PERSISTENCE_ERROR`
- `AUTH_ERROR`

All errors thrown at package boundaries carry one of these codes.

---

### packages/db

**Purpose:** Database schema, migrations, and client factories. Uses Drizzle ORM exclusively.

**Directory structure:**

```
db/
├── src/
│   ├── schema/           # 20 Drizzle table definitions
│   │   ├── market.ts     # symbols, timeframes
│   │   ├── ohlcv.ts      # candles, live_ticks
│   │   ├── indicators.ts # computed indicator values
│   │   ├── agent.ts      # chat threads, messages, tool calls
│   │   ├── briefings.ts  # daily/weekly briefings
│   │   ├── admin.ts      # users, sessions
│   │   ├── events.ts     # economic events, COT reports
│   │   └── ...
│   ├── client.ts         # Postgres + PGlite client factories
│   ├── migrate.ts        # Migration runner
│   └── index.ts          # Barrel — exports db, schema, all tables
├── drizzle/              # SQL migration files
└── drizzle.config.ts     # Drizzle Kit config
```

**20 Tables (key groups):**

| Group | Tables |
|---|---|
| Market | `symbols`, `timeframes` |
| OHLCV | `candles_1m`, `candles_5m`, `candles_15m`, `candles_30m`, `candles_1h`, `candles_4h`, `candles_1d`, `candles_1w`, `live_ticks` |
| Indicators | `sma_values`, `ema_values`, `rsi_values`, `macd_values`, `smc_swings`, `smc_fvg`, `smc_order_blocks`, `smc_liquidity` |
| Agent | `chat_threads`, `chat_messages`, `tool_calls`, `briefings`, `evals` |
| Admin | `users`, `accounts`, `sessions`, `verification_tokens` |
| External | `economic_events`, `cot_reports` |

**Client Factories:**

```typescript
// Postgres — production
createPostgresClient(poolSize: number): PostgresClient
// PGlite — local development
createPGliteClient(dataDir: string): PGliteClient
```

Pool sizes:
- **Web app:** 5 connections (per serverless instance)
- **Worker:** 3 connections (long-lived daemon)

Both clients conform to the same Drizzle interface; code writing queries does not differentiate between them.

**Migration Policy:**

- All schema changes go through Drizzle Kit.
- Migration files live in `drizzle/` — always committed.
- Never hand-edit SQL in the `drizzle/` directory.
- Run `pnpm db:migrate` to apply; `pnpm db:generate` to create new migrations after schema changes.

---

### packages/indicators

**Purpose:** Pure TypeScript technical indicators and Smart Money Concepts (SMC). Zero I/O, zero side effects. Every function is a pure transformation from input data to output.

**Directory structure:**

```
indicators/
├── src/
│   ├── conventional/     # Classic indicators
│   │   ├── sma.ts
│   │   ├── ema.ts
│   │   ├── rsi.ts
│   │   ├── macd.ts
│   │   ├── atr.ts
│   │   ├── bollinger.ts
│   │   └── pivots.ts
│   ├── smc/              # Smart Money Concepts
│   │   ├── swings.ts     # Swing high/low detection
│   │   ├── structure.ts  # BOS (Break of Structure), CHoCH
│   │   ├── fvg.ts        # Fair Value Gaps
│   │   ├── order-blocks.ts # Order block detection
│   │   ├── liquidity.ts  # Liquidity levels (equal highs/lows)
│   │   ├── pdh-pdl.ts    # Previous Day High/Low
│   │   └── asian-range.ts # Asian session range
│   └── index.ts          # Barrel
```

**Conventional Indicators:**

| Indicator | Output |
|---|---|
| SMA | `number[]` — simple moving average per bar |
| EMA | `number[]` — exponential moving average per bar |
| RSI | `number[]` — RSI (0-100) per bar |
| MACD | `{ macd: number[]; signal: number[]; histogram: number[] }` |
| ATR | `number[]` — average true range per bar |
| Bollinger | `{ upper: number[]; middle: number[]; lower: number[] }` |
| Pivots | `{ pp: number; r1-r3: number; s1-s3: number }` |

**SMC Concepts:**

| Concept | Description |
|---|---|
| Swings | Identifies swing highs and lows from OHLC data |
| BOS | Break of Structure — price breaks prior swing high/low |
| CHoCH | Change of Character — reversal signal when BOS fails |
| FVG | Fair Value Gap — 3-candle pattern with price imbalance |
| Order Blocks | Zones where institutions likely accumulated positions |
| Liquidity | Equal highs/lows indicating stop-hunt zones |
| PDH/PDL | Previous day's high and low |
| Asian Range | High/low range of the Asian trading session |

**Design Principle:** Indicators never access the database, network, or filesystem. They accept arrays of OHLCV data and return computed arrays. This makes them trivially testable and reusable in both the web app (for chart overlays) and the worker (for persistence).

---

### packages/data

**Purpose:** Data provider adapters, caching, health-aware failover, and rate throttling. This is the single entry point for all external market data. No other package or app calls providers directly.

**Directory structure:**

```
data/
├── src/
│   ├── providers/        # Individual provider adapters
│   │   ├── biquote/      # Primary: REST + SignalR real-time
│   │   ├── finnhub/      # Fallback: REST quotes, news
│   │   ├── marketaux/    # News sentiment analysis
│   │   ├── fred/         # FRED macro-economic data
│   │   └── cftc/         # Commitment of Traders reports
│   ├── cache/            # SWR (stale-while-revalidate) layer
│   ├── failover.ts       # Health-aware provider failover
│   ├── throttle.ts       # Rate limiter
│   └── index.ts          # Barrel — public API only
```

**Provider Adapters:**

| Provider | Role | Protocol | Data Types |
|---|---|---|---|
| BiQuote | Primary market data | REST + SignalR | OHLCV, real-time ticks, quote snapshots |
| Finnhub | Fallback quotes | REST | OHLCV, company news |
| Marketaux | News + sentiment | REST | News articles, sentiment scores |
| FRED | Macro-economic | REST | Interest rates, GDP, CPI, employment |
| CFTC | CoT reports | REST | Commitment of Traders positioning data |

**Cache Layer (SWR):**

- Stale-while-revalidate pattern.
- Cached data is returned immediately; revalidation happens in the background.
- Cache TTLs vary by data type (ticks: 1s, candles: 60s, macro: 1h).
- Disk-backed for persistence across restarts.

**Failover (`failover.ts`):**

The `runWithFailover` function is the canonical way to call any provider:

```typescript
async function runWithFailover<T>(
  primary: () => Promise<T>,
  fallbacks: Array<() => Promise<T>>,
  healthCheck: () => Promise<boolean>
): Promise<T>
```

- Pings primary health endpoint.
- Falls back to Finnhub if BiQuote is unhealthy.
- Logs and alerts on failover events.
- Returns to primary when health is restored.

**Rate Throttling (`throttle.ts`):**

- Token bucket algorithm.
- Per-provider rate limits configured from provider tiers.
- Queues requests when rate limit is hit; rejects if queue is full.

**Rule:** All data access from `@hamafx/ai`, `apps/web`, and `apps/worker` MUST go through `@hamafx/data`. Direct provider imports are forbidden.

---

### packages/ai

**Purpose:** The largest package — chat orchestration, AI tool definitions, model routing, system prompts, planning, memory/RAG, verification, briefings, committee logic, Telegram integration, evaluation system, cost tracking, and persistence.

**Directory structure:**

```
ai/
├── src/
│   ├── tools/            # 32 AI tool implementations
│   │   ├── market/       # getCandles, getQuote, getTick, getSpread, ...
│   │   ├── indicators/   # getSMA, getRSI, getMACD, getBollinger, getATR, ...
│   │   ├── smc/          # getSwings, getStructure, getFVG, getOrderBlocks, getLiquidity, ...
│   │   ├── news/         # getNews, getSentiment, getEconomicCalendar, ...
│   │   ├── macro/        # getFRED, getCOT, getYieldCurve, ...
│   │   ├── analysis/     # runScan, compareCorrelation, detectDivergence, ...
│   │   ├── account/      # getPositions, getOrders, getBalance, getPnL (MT5 via worker)
│   │   ├── admin/        # getStatus, getMetrics, getCostReport
│   │   └── index.ts      # Tool registry (name → implementation map)
│   ├── agent.ts          # Chat orchestration loop
│   ├── routing.ts        # Model routing (GPT-4o, Claude Sonnet, etc.)
│   ├── planner.ts        # Task plan generation before tool execution
│   ├── prompt/
│   │   └── system.ts     # System prompt template
│   ├── memory/           # RAG — vector embeddings, similarity search
│   ├── verify.ts         # Response verification against retrieved data
│   ├── briefings.ts      # Daily/weekly briefing generation
│   ├── committee.ts      # Multi-model committee for high-stakes decisions
│   ├── telegram.ts       # Telegram bot integration
│   ├── eval/             # Evaluation harness
│   ├── cost.ts           # Token cost tracking per thread/tool
│   ├── persist.ts        # Chat persistence (threads, messages, tool calls)
│   └── index.ts          # Barrel
```

**32 Tools (categorized):**

| Category | Count | Tools |
|---|---|---|
| Market Data | 5 | getCandles, getQuote, getTick, getSpread, getSymbolInfo |
| Indicators | 6 | getSMA, getEMA, getRSI, getMACD, getATR, getBollinger |
| SMC | 7 | getSwings, getStructure, getFVG, getOrderBlocks, getLiquidity, getPDHPDL, getAsianRange |
| News | 3 | getNews, getSentiment, getEconomicCalendar |
| Macro | 3 | getFRED, getCOT, getYieldCurve |
| Analysis | 4 | runScan, compareCorrelation, detectDivergence, analyzeMultiTF |
| Account | 3 | getPositions, getOrders, getPnl |
| Admin | 1 | getStatus |
| **Total** | **32** | |

**Chat Orchestration (`agent.ts`):**

The core loop:

1. Accept user message + thread context.
2. Load tool definitions matching the current plan.
3. Route to appropriate model (see routing below).
4. Model returns text response and/or tool calls.
5. Execute tool calls (with telemetry, error handling).
6. Feed results back into context.
7. Repeat until model emits a final response (no more tool calls).
8. Verify response against retrieved data (`verify.ts`).
9. Persist thread and emit streaming events.

**Model Routing (`routing.ts`):**

Routes requests based on complexity:

| Complexity | Model | Use Case |
|---|---|---|
| Low | GPT-4o-mini or Claude Haiku | Simple queries, status checks |
| Medium | GPT-4o or Claude Sonnet | Technical analysis, multi-tool |
| High | Claude Opus or GPT-4o (extended) | Multi-timeframe deep dives |
| Committee | 3 models in parallel | High-stakes trading decisions |

Cost and latency budgets are enforced per complexity tier.

**System Prompt (`prompt/system.ts`):**

Core persona: a professional forex/gold analyst. The prompt enforces:
- Always cite specific data (price levels, indicator values, timeframes).
- Never give financial advice — only analysis.
- Use SMC terminology when relevant (BOS, FVG, liquidity grabs).
- When uncertain, state uncertainty explicitly.
- Always use tools to fetch live data — never guess.

**Planner (`planner.ts`):**

Before a complex multi-tool analysis, the planner generates a task plan:
- Identifies required tools and their call order.
- Estimates dependencies between tool calls.
- Plans are injected into the system prompt as structured context.

**Memory / RAG (`memory/`):**

- Stores vector embeddings of past analyses and market events.
- At query time, retrieves top-K relevant context.
- Uses the same embedding model as the chat pipeline.
- Embeddings backfill is a worker job (`embedding-backfill`).

**Verification (`verify.ts`):**

Post-response verification step:
- Extracts factual claims from the model's response (prices, levels, indicator values).
- Re-runs the relevant tool calls to get ground truth.
- Flags discrepancies > threshold (e.g., price off by more than 0.1%).
- Verification results are appended to the thread but not shown to the user unless critical.

**Briefings (`briefings.ts`):**

Automated market briefings generated by the worker:
- **Daily briefing:** Morning analysis for each symbol (XAUUSD, EURUSD, GBPUSD).
- **Weekly review:** Weekend summary with multi-timeframe analysis and CoT data.
- Generated by the same agent loop; formatted as structured markdown.
- Delivered via Telegram or web UI.

**Committee (`committee.ts`):**

For high-stakes decisions:
- Sends the same prompt to 3 different models in parallel.
- Collects responses and identifies consensus/divergence.
- Reports results with confidence score.
- Used for key level identification and bias confirmation.

**Telegram (`telegram.ts`):**

- Inbound: Listens for `/analyze`, `/briefing`, `/status`, `/help` commands.
- Outbound: Sends briefings and alerts.
- Shares the same agent orchestration as the web chat.

**Evaluation System (`eval/`):**

- Prompt-level evals: does the model output match expected tool calls?
- Accuracy evals: are factual claims correct?
- Regression suite: known queries with expected outputs.
- Cost tracking per eval run.

**Cost Tracking (`cost.ts`):**

- Token counting per thread, per tool, per user.
- Aggregated daily/weekly/monthly reports.
- Available via admin tool `getCostReport`.

**Persistence (`persist.ts`):**

- Threads, messages, tool calls, evaluation results.
- Uses `@hamafx/db` for storage.
- Streaming incremental saves during agent loop.

---

### packages/test-utils

**Status:** Empty placeholder. Reserved for future on-chain analysis, DEX integration, or token sentiment.

No imports, no exports, no dependents. Do not add code here without explicit approval.

---

### packages/config

**Status:** Empty placeholder. Reserved for shared worker utilities extracted from `apps/worker`.

No imports, no exports, no dependents. Do not add code here without explicit approval.

---

## Apps

### apps/web

**Purpose:** Next.js 15 frontend application — the user-facing trading analysis dashboard.

**Directory structure:**

```
web/
├── src/
│   ├── app/                  # App Router
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Landing / dashboard
│   │   ├── chat/             # AI chat interface
│   │   ├── chart/            # Interactive TradingView charts
│   │   ├── briefing/         # Daily/weekly briefing viewer
│   │   ├── scan/             # Market scanner
│   │   ├── macro/            # Macro dashboard (FRED, CoT)
│   │   ├── auth/             # Login/logout
│   │   ├── settings/         # User preferences
│   │   ├── admin/            # Admin panel (cost, status)
│   │   └── api/              # 30+ API routes
│   │       ├── chat/
│   │       ├── chart/
│   │       ├── auth/
│   │       ├── briefings/
│   │       └── ...
│   ├── middleware.ts         # Edge middleware
│   ├── components/           # React components
│   │   ├── ui/               # shadcn/ui primitives
│   │   ├── chart/            # Chart components
│   │   ├── chat/             # Chat UI components
│   │   └── layout/           # Shell, nav, sidebar
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Client-side utilities
│   └── styles/               # Tailwind v4 globals
├── public/
│   ├── sw.js                 # Service worker (PWA)
│   └── manifest.json         # PWA manifest
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

**12 Page Routes:**

| Route | Description |
|---|---|
| `/` | Dashboard — multi-symbol overview, key levels |
| `/chart/[symbol]` | Interactive chart with TradingView widget |
| `/chat` | AI analysis chat interface |
| `/chat/[threadId]` | Specific chat thread |
| `/briefing` | Latest daily briefing |
| `/briefing/[id]` | Specific briefing |
| `/scan` | Market scanner / screener |
| `/macro` | Macro data dashboard |
| `/login` | Login page |
| `/auth/logout` | Logout handler |
| `/settings` | User preferences |
| `/admin` | Admin panel (cost reports, system status) |

**30+ API Routes:**

API routes serve as thin wrappers around `@hamafx/ai` and `@hamafx/data`. They handle auth, parameter validation, and streaming.

Key route groups:
- `api/chat/` — Chat completions with SSE streaming
- `api/chart/` — Candlestick data, indicator overlays
- `api/auth/` — Login, logout, session management
- `api/briefings/` — Briefing CRUD
- `api/scan/` — Scanner queries
- `api/macro/` — Macro data endpoints
- `api/admin/` — Protected admin endpoints

**Middleware (`middleware.ts`):**

- Runs at the Edge (Vercel/Cloudflare).
- Session cookie validation.
- Route protection (auth-required pages).
- **Critical rule:** Never import `@hamafx/db` in middleware. Edge runtime does not support Node.js `pg` driver. Use lightweight session checks only.

**Auth:**

- NextAuth.js based multi-tenant authentication.
- Supports OAuth (Google, GitHub) and Credentials providers.
- Session stored securely.
- Multi-tenant design: users have isolated data access (scoped via `userId`).

**Frontend Stack:**

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 15 | App framework |
| Tailwind CSS | v4 | Styling |
| shadcn/ui | latest | Component primitives |
| TradingView lightweight-charts | v5 | Interactive charting |
| React Query (TanStack) | latest | Server state management |
| nuqs | latest | URL search param state |

**State Management:**

- **Server state:** React Query — all fetched data is cached and synchronized.
- **URL state:** nuqs — chart timeframe, symbol, indicator toggles are reflected in URL search params.
- **Client state:** React context for auth session and theme.

**PWA:**

- Service worker (`sw.js`) enables offline caching of static assets.
- PWA manifest for installable experience.
- Charts and analysis require network; only UI shell is cached offline.

---

### apps/worker

**Purpose:** Node.js long-running daemon for background data ingestion, aggregation, and scheduled jobs.

**Directory structure:**

```
worker/
├── src/
│   ├── index.ts              # Entry point — boot sequence
│   ├── consumers/
│   │   └── biquote-signalr.ts # SignalR real-time tick consumer
│   ├── buffers/
│   │   └── tick-buffer.ts    # TickBuffer → 1Hz flush to live_ticks
│   ├── aggregators/
│   │   └── candle-1m.ts      # Candle1mAggregator from ticks
│   ├── jobs/                 # Scheduled job definitions
│   │   ├── briefings.ts      # Daily briefing generation
│   │   ├── snapshots.ts      # Periodic OHLCV snapshots
│   │   ├── cot.ts            # Weekly CoT report fetch
│   │   ├── fred-actuals.ts   # Macro data updates
│   │   ├── weekly-review.ts  # Week-end review generation
│   │   ├── embedding-backfill.ts # RAG embedding re-index
│   │   └── resonance-sync.ts # Resonance model sync
│   ├── health.ts             # Healthchecks.io heartbeat pings
│   ├── sentry.ts             # Sentry error reporting init
│   ├── bridge/
│   │   └── mt5.ts            # MetaTrader 5 bridge (position/order sync)
│   └── systemd.ts            # systemd notify + watchdog integration
├── systemd/
│   └── hamafx-worker.service # systemd unit file
└── package.json
```

**Boot Sequence:**

1. Load and validate environment.
2. Initialize Sentry.
3. Initialize Postgres client (pool size 3).
4. Start SignalR consumer (BiQuote tick stream).
5. Start TickBuffer (accumulates ticks, flushes at 1Hz).
6. Start Candle1mAggregator (builds 1m candles from ticks).
7. Register cron jobs.
8. Start Healthchecks.io heartbeat pings.
9. Notify systemd (ready).
10. Enter event loop.

**SignalR Consumer (`biquote-signalr.ts`):**

- Persistent WebSocket-like connection to BiQuote real-time feed.
- Subscribes to XAUUSD, EURUSD, GBPUSD tick streams.
- Auto-reconnect with exponential backoff.
- Emits parsed tick objects to the TickBuffer.

**TickBuffer (`tick-buffer.ts`):**

- Accumulates ticks from SignalR consumer in memory.
- Flushes to `live_ticks` table at 1Hz.
- During flush: groups ticks by symbol, inserts batch.
- Prevents DB write amplification from high-frequency tick stream (10-50 ticks/sec).

**Candle1mAggregator (`candle-1m.ts`):**

- Listens to tick buffer flushes.
- Aggregates OHLCV for 1-minute candles.
- Inserts into `candles_1m` table.
- Downstream candle tables (5m, 15m, etc.) are materialized via DB views or scheduled roll-up jobs.

**7 Job Types:**

| Job | Schedule | Description |
|---|---|---|
| `briefings` | Daily, 07:00 UTC | Generate morning market briefing (impacted by `PER_USER_BRIEFINGS`) |
| `snapshots` | Every 5 min | Snapshot current OHLCV for all symbols/timeframes |
| `cot` | Weekly, Fri 20:30 UTC | Fetch CFTC Commitment of Traders report |
| `fred-actuals` | Daily, 14:00 UTC | Update FRED macro indicators |
| `weekly-review` | Weekly, Sat 08:00 UTC | Generate weekend review with multi-TF analysis |
| `embedding-backfill` | Daily, 02:00 UTC | Re-index embeddings for RAG |
| `resonance-sync` | Every 30 min | Sync resonance model state |

**Healthchecks.io (`health.ts`):**

- Periodic heartbeat pings (every 60s).
- `start` signal at boot; `fail` signal on crash.
- Configurable via `HEALTHCHECKS_URL` env var.
- Separate check slugs per job for granular monitoring.
- Exposes an HTTP healthcheck on port `8081` for Docker liveness checks.

**Sentry (`sentry.ts`):**

- Global error handler.
- Captures unhandled rejections and uncaught exceptions.
- Context: includes job name, symbol, timeframe where applicable.

**MT5 Bridge (`bridge/mt5.ts`):**

- Bridges MetaTrader 5 account data.
- Queries open positions, pending orders, account balance, PnL.
- Exposes as tool-callable endpoints through the worker's internal API.
- Used by `@hamafx/ai` account tools (getPositions, getOrders, getPnl).

**systemd Integration:**

- Type=notify: worker sends `sd_notify("READY=1")` after boot.
- WatchdogSec=30s: worker sends keepalive pings.
- Service file at `systemd/hamafx-worker.service`.

---

## Conventions

### Naming & Files

| Rule | Example |
|---|---|
| Filenames: kebab-case | `order-blocks.ts`, `tick-buffer.ts` |
| React components: PascalCase | `ChatPanel.tsx`, `ChartView.tsx` |
| Test files: `*.test.ts` | `sma.test.ts`, `failover.test.ts` |
| Config files: flat config where possible | `eslint.config.mjs`, `drizzle.config.ts` |
| Directories: kebab-case | `order-blocks/`, `tick-buffer/` |

### Exports & Barrels

Every package has an `index.ts` barrel that re-exports the public API. Internal implementation details are NOT exported from the barrel.

```typescript
// packages/data/src/index.ts
export { getCandles } from './providers/biquote/candles';
export { runWithFailover } from './failover';
export { getCache, setCache } from './cache';
// No internal types or helpers exported here
```

Pattern: `export * from './schema/index'` used within `@hamafx/db` to flatten table exports.

### TypeScript

- **Strict mode** everywhere. No exceptions.
- `noUncheckedIndexedAccess: true` — always handle the `undefined` case.
- Prefer `type` imports (`import type { ... }`).
- No `any` without an `// eslint-disable-next-line` comment explaining why.
- Use `satisfies` operator for exhaustiveness checks on union types.
- Zod infer for deriving types from schemas; never duplicate type definitions.

### Validation & Boundaries

**Zod at every package boundary:**

- `@hamafx/shared` defines all schemas.
- Every exported function in `@hamafx/data`, `@hamafx/ai`, API routes validates inputs with Zod.
- API routes validate query params, body, and path params.
- Worker jobs validate config before execution.
- Tool implementations validate arguments before execution.

**Package boundary rule:** Data crossing package boundaries (e.g., `data` → `ai` or `ai` → `web`) MUST be validated. Trust nothing from callers.

### Database

**Atomic operations for shared state:**

- Use Drizzle transactions for multi-table writes.
- Use `onConflictDoUpdate` (upsert) for idempotent operations.
- Use `for update` row locking for critical sections (briefing generation, CoT updates).
- Never use `pg_advisory_lock` directly — wrap in Drizzle abstractions.

**PGlite for local dev:**

- `@hamafx/db` provides PGlite client factory.
- All tests default to PGlite (no external DB required).
- CI runs both PGlite and Postgres test suites.
- PGlite runs in-memory or disk-backed depending on `PGLITE_DATA_DIR`.

### Error Handling

- Use error codes from `@hamafx/shared/errors.ts`.
- Wrap errors at package boundaries with context.
- Provider errors are caught in `@hamafx/data` and re-thrown as `PROVIDER_UNAVAILABLE` or `RATE_LIMITED`.
- Tool errors are caught in the agent loop and surfaced as structured error messages to the model.
- Worker jobs never crash on individual failures — they log and continue.

### Context & State

**AsyncLocalStorage for per-turn context:**

The `@hamafx/ai` agent loop uses `AsyncLocalStorage` to propagate:
- Current thread ID
- Current user ID
- Request ID (for tracing)
- Cost accumulator

This avoids threading context through every function signature.

**No global mutable state:**
- Packages must be stateless.
- Apps may hold state (worker: SignalR connection; web: React state).
- Never use module-level mutable variables in packages.

### Observability

- **Logging:** Structured JSON logs. Include `requestId`, `threadId`, `toolName`, `symbol`, `timeframe` where applicable.
- **Metrics:** Tool call latency, model latency, token usage, provider health, DB query times.
- **Traces:** Request ID propagated through all async operations.
- **Alerts:** Healthchecks.io for worker liveness; Sentry for error rates.

---

## AI Agent Extension Rules

When extending this codebase as an AI agent, follow these rules precisely. Violating them will cause CI failures, production incidents, or data corruption.

### Hard Constraints

1. **NEVER import `@hamafx/db` in Edge/middleware.**
   `apps/web/src/middleware.ts` runs at the Edge. The Edge runtime does not support Node.js native modules (`pg`, `better-sqlite3`). Middleware must be lightweight — session cookie validation only.

3. **NEVER add direct provider calls.**
   All external data access MUST go through `@hamafx/data`. Importing `node-fetch`, `axios`, or provider SDKs in `@hamafx/ai`, `apps/web`, or `apps/worker` is forbidden.

4. **NEVER create circular dependencies.**
   The dependency chain is strictly linear: `config → shared → db/indicators → data → ai → web/worker`. Adding a reverse import will break the build.

### Data Source Integration

When adding a new data source (e.g., a new provider for sentiment, options data, or on-chain metrics):

1. **Create a provider adapter** in `packages/data/src/providers/<name>/`.
2. **Implement the adapter** with:
   - A Zod schema for the provider's response shape.
   - Rate limit handling (respect the provider's documented limits).
   - Timeout handling (default 10s, configurable).
   - Error normalization — map provider errors to shared error codes.
3. **Register in `failover.ts`** as a fallback for the relevant primary provider.
4. **Register in `throttle.ts`** with the provider's rate limit tier.
5. **ALWAYS wrap external calls with `runWithFailover`** — never call the provider directly.
6. **Export from `packages/data/src/index.ts`** barrel.

### Tool Creation

When adding a new AI tool to `@hamafx/ai`:

1. **Create the tool file** in `packages/ai/src/tools/<category>/`.
2. **Implement the tool function:**
   - Signature: `async (args: T, ctx: ToolContext) => Promise<ToolResult>`.
   - `ToolContext` provides: `threadId`, `userId`, `requestId`, cost tracker.
   - Validate args with Zod at the top of the function.
   - Fetch data ONLY through `@hamafx/data` (never call providers directly).
   - Return structured results (not raw provider responses).
3. **ALWAYS wrap with `withTelemetry()`:**
   ```typescript
   export const getRSI = withTelemetry('getRSI', async (args, ctx) => { ... });
   ```
   This instruments latency, error rate, and cost tracking automatically.
4. **Register in the tool registry** — `packages/ai/src/tools/index.ts`.
5. **Add the tool name** to the tools registry in `packages/shared/src/ai/tool-names.ts`.
6. **Add tool description** to the system prompt in `packages/ai/src/prompt/system.ts`.
7. **Update the planner** if the tool requires specific ordering with other tools.

### Schema Changes

When modifying the database schema:

1. **Edit Drizzle schema files** in `packages/db/src/schema/`.
2. **Run `pnpm db:generate`** to create migration files.
3. **Review generated SQL** — never commit migrations without reading them.
4. **Update Zod schemas** in `@hamafx/shared` if the change affects domain types.
5. **Run migrations** with `pnpm db:migrate`.
6. **ALWAYS test with both PGlite and Postgres** before merging.

### Testing Requirements

1. **ALWAYS test new code with both PGlite and Postgres.**
   - PGlite tests run locally without external dependencies.
   - Postgres tests run in CI with a real Postgres instance.
   - Differences in behavior (e.g., type coercion, locking) must be caught.

2. **ALWAYS test data source integrations:**
   - Mock provider HTTP responses.
   - Test failover path (primary down → fallback).
   - Test rate limit behavior.
   - Test timeout behavior.

3. **ALWAYS test indicator functions:**
   - Compare against known values (e.g., TradingView RSI for a standard dataset).
   - Test edge cases: empty input, single bar, NaN values.

4. **ALWAYS test new tools:**
   - Mock the data layer to return known values.
   - Verify the tool's output shape.
   - Verify error handling (data unavailable, validation failure).

5. **Test file naming:** `<name>.test.ts` alongside the implementation file.

---

## Quick Reference

| Question | Answer |
|---|---|
| Where do I add a new ESLint rule? | `packages/config/eslint.config.mjs` |
| Where do I add a new domain type? | `packages/shared/src/schemas/` + Zod schema |
| Where do I add a new DB table? | `packages/db/src/schema/` + run `db:generate` |
| Where do I add a new indicator? | `packages/indicators/src/` + pure function |
| Where do I add a new data provider? | `packages/data/src/providers/` |
| Where do I add a new AI tool? | `packages/ai/src/tools/` + registry + prompt |
| Where do I add a new page? | `apps/web/src/app/` |
| Where do I add a new API route? | `apps/web/src/app/api/` |
| Where do I add a new worker job? | `apps/worker/src/jobs/` |
| How do I stream AI responses? | SSE from `api/chat` — see `agent.ts` |
| How do I run DB migrations locally? | `pnpm db:migrate` |
| How do I run tests? | `pnpm test` (all) or `pnpm test --filter=@hamafx/data` |
| How do I check types? | `pnpm typecheck` |