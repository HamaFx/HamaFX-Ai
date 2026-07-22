# 01 — Architecture & System Design

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Cross-references:** [02-data-flows.md](./02-data-flows.md) · [03-backend-api.md](./03-backend-api.md) · [04-frontend-ux.md](./04-frontend-ux.md) · [05-security-auth-compliance.md](./05-security-auth-compliance.md) · [06-deployment-self-hosting.md](./06-deployment-self-hosting.md) · [07-agent-understanding.md](./07-agent-understanding.md) · [08-agent-setup-run.md](./08-agent-setup-run.md)

---

## 1. Project Identity

HamaFX-Ai is an open-source, multi-tenant, chat-driven AI trading copilot for forex instruments — primarily **XAUUSD** (gold), **EURUSD**, and **GBPUSD**. It ships from a single codebase serving two identities:

- **Hosted SaaS**: the founder runs a subscription product on Vercel + GCE VM + Supabase.
- **Self-hosted**: anyone can clone, configure, and run the same code via Docker Compose or native PGlite.

**License:** Apache-2.0 (`LICENSE`)
**Repo:** `github.com/HamaFx/HamaFX-Ai`

---

## 2. Tech Stack

| Layer | Technology | Source |
|-------|-----------|--------|
| Package manager | pnpm 9.15.4 | `package.json` → `packageManager` |
| Node | ≥ 20.11 | `package.json` → `engines.node`, `.nvmrc` = 20 |
| Monorepo | Turborepo 2 | `turbo.json`, `pnpm-workspace.yaml` |
| Web framework | Next.js 15 (App Router) + React 19 | `apps/web/package.json` |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) | `apps/web/postcss.config.mjs`, `packages/config/tailwind/` |
| AI SDK | Vercel AI SDK v5 (`ai` package) | `packages/ai/package.json` |
| LLM providers | Google Gemini (direct), Vercel AI Gateway, 9-provider BYOK registry | `packages/ai/src/byok-providers.ts`, `packages/ai/src/model.ts` |
| Database | Postgres (Supabase) + pgvector, Drizzle ORM | `packages/db/package.json`, `packages/db/src/schema/` |
| Local DB | PGlite (embedded Postgres via WASM) | `packages/db/src/pglite-client.ts` |
| Charts | TradingView lightweight-charts v5 + TradingView Pro widget | `apps/web/src/components/chart/` |
| Tests | Vitest (173 files), Playwright E2E (16 spec files) | `vitest.workspace.ts`, `apps/web/playwright.config.ts` |
| Lint | ESLint flat config | `packages/config/eslint/index.js` |
| TypeScript | Strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` | `tsconfig.base.json` |
| Worker runtime | Node.js daemon (esbuild bundled) | `apps/worker/package.json` |
| Background jobs | node-cron (Docker) / systemd timers (production VM) | `apps/worker/src/scheduler.ts`, `infra/cron-vm/units/` |
| Observability | Sentry, Langfuse (self-hosted), healthchecks.io | `apps/web/src/sentry.server.config.ts`, `docker-compose.yml` |

---

## 3. Monorepo Structure

```
HamaFX-Ai/
├── apps/
│   ├── web/              # Next.js 15 PWA (frontend + API routes + auth)
│   └── worker/           # Node.js daemon (SignalR, tick processing, job runner)
├── packages/
│   ├── ai/               # AI agent core — chat, 32 tools, routing, memory, persistence
│   ├── data/             # Market data adapters — price, candles, news, failover, caching
│   ├── db/               # Drizzle schema (46 tables) + Postgres/PGlite client
│   ├── indicators/       # Technical indicators — SMA, EMA, RSI, MACD, SMC structure
│   ├── shared/           # Zod schemas, domain types, env validation, encryption, billing
│   ├── config/           # Shared ESLint, Prettier, TS configs (not compiled)
│   └── test-utils/       # Shared test factories, mocks, vitest helpers
├── docs/                 # This documentation set
├── infra/cron-vm/        # GCE VM setup script + systemd units + backup scripts
├── tools/                # Lighthouse
└── scripts/              # dev.ts (local dev entrypoint), predeploy-migrate.mjs
```

**Dependency chain:** `config` → `shared` → `db` + `indicators` → `data` → `ai` → `web` + `worker`

No package imports upstream of itself. The `shared` package is the foundation — it defines Zod schemas, env validation, encryption, and domain types that every other package depends on.

---

## 4. High-Level Architecture Diagram

```
+---------------------------------------------------------------------------+
|                              BROWSER (PWA)                                 |
|                                                                           |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  | Chat UI           |  | Chart Engine      |  | Dashboard / Settings  |  |
|  | (useChat stream)  |  | (TradingView +    |  | (TanStack Query/SWR)  |  |
|  | 39 tool UI parts  |  |  lightweight-charts)| | 29 pages, 10 widgets |  |
|  +--------+----------+  +--------+----------+  +----------+------------+  |
|           |                      |                       |               |
+-----------+----------------------+-----------------------+---------------+
            |                      |                       |
            v                      v                       v
+---------------------------------------------------------------------------+
|                        VERCEL — apps/web (Next.js 15)                      |
|                                                                           |
|  +------------------+  +------------------+  +---------------------------+|
|  | Edge Middleware  |  | /api/chat        |  | /api/market/*             ||
|  | (auth.ts config) |  | runChat()        |  | @hamafx/data              ||
|  | JWT + CSRF + RID |  | streamText + 32  |  | BiQuote→Finnhub failover  ||
|  |                  |  | tools            |  | + Binance                ||
|  +------------------+  +--------+---------+  +---------------------------+|
|                                 |                                         |
|  +------------------+  +--------+---------+  +---------------------------+|
|  | /api/cron/* (12) |  | /api/billing/*   |  | /api/auth/* /api/bot/*    ||
|  | Bearer-gated     |  | NOWPayments      |  | NextAuth + Telegram       ||
|  +------------------+  +------------------+  +---------------------------+|
+---------------------------------------------------------------------------+
            |                                          |
            | DB (Supabase Postgres + pgvector)        | AI (Vercel AI Gateway /
            | 50 tables, 52 migrations                 |   Google Gemini / BYOK)
            |                                          |
+---------------------------------------------------------------------------+
|                    GCE VM — hamafx-cron (e2-medium)                        |
|                                                                           |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  | SignalR Consumer  |  | Candle Aggregator |  | systemd timers        |  |
|  | (BiQuote ticks)   |  | (1m OHLC from     |  | (8 heavy jobs +       |  |
|  | TickBuffer→DB     |  |  tick stream)     |  |  4 light cron pokes)  |  |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  | Binance WS        |  |                     |  |                     |  |
|  | (crypto ticks)    |  |                     |  | (TCP:8080)            |  |
|  +-------------------+  +-------------------+  +-----------------------+  |
+---------------------------------------------------------------------------+
```

---

## 5. The Two Apps

### 5.1 apps/web — Next.js 15 PWA

The web app is the user-facing product. It contains:

- **Frontend**: 29 pages across two route groups — `(app)` (authenticated) and `(auth)` (login/register/forgot-password). Plus `/onboarding`, `/share/[id]` (public), and `/debug`.
- **API routes**: 93 route files under `apps/web/src/app/api/`. See [03-backend-api.md](./03-backend-api.md) for the full reference.
- **Auth**: NextAuth.js v5 with Credentials provider (email+password, bcrypt). JWT strategy, 30-day sessions. See [05-security-auth-compliance.md](./05-security-auth-compliance.md).
- **Middleware** (`apps/web/src/middleware.ts`): Edge runtime — CSRF double-submit cookie, NextAuth JWT validation, request-id stamping, `x-user-id` header injection.
- **PWA**: `manifest.ts` (standalone, portrait, black theme), service worker (`scripts/generate-sw.mjs` + `scripts/sw.template.js`), web push (VAPID), offline page.
- **Build**: `output: 'standalone'` when not on Vercel (`next.config.mjs`). Vercel build runs `scripts/predeploy-migrate.mjs` before `turbo run build`.

### 5.2 apps/worker — Node.js Daemon

The worker is a persistent Node.js process that handles real-time data ingestion and heavy scheduled jobs. It runs in two modes:

- **Docker mode** (`WORKER_MODE=docker`): Uses `node-cron` for scheduling (`apps/worker/src/scheduler.ts`). Runs alongside the web app in `docker-compose.yml`.
- **Production mode** (GCE VM): Runs as `hamafx-worker.service` under systemd (`Type=notify`). Heavy jobs run as systemd one-shot timers. See [06-deployment-self-hosting.md](./06-deployment-self-hosting.md).

**Worker components:**

| Component | Source | Purpose |
|-----------|--------|---------|
| SignalR Consumer | `apps/worker/src/signalr/consumer.ts` | Persistent BiQuote hub connection, subscribes to XAUUSD/EURUSD/GBPUSD ticks |
| TickBuffer | `apps/worker/src/signalr/tick-buffer.ts` | Buffers ticks, flushes to `live_ticks` table at 1Hz |
| Candle1mAggregator | `apps/worker/src/aggregator/candle-1m.ts` | Builds 1-minute OHLC candles from tick stream, UPSERTs to `candles_1m` on close |
| Binance WS Consumer | `apps/worker/src/binance/consumer.ts` | Live crypto klines (BTC, ETH, SOL, BNB, XRP, ADA) |
| Scheduler | `apps/worker/src/scheduler.ts` | node-cron schedule for Docker mode (alerts every min, briefings every 5 min, etc.) |
| Job Runner CLI | `apps/worker/src/runner/cli.ts` | Entry point for systemd one-shot jobs: `node dist/runner/cli.js <name>` |
| Healthchecks.io | `apps/worker/src/healthchecks.ts` | Heartbeat pings every 30s while consumer is alive |
| SD-Notify | `apps/worker/src/sd-notify.ts` | systemd readiness/watchdog notifications |

**Job registry** (`apps/worker/src/jobs/index.ts`): 8 jobs — alerts, briefings, embedding-backfill, snapshots, cot, fred-actuals, weekly-review, resonance-sync.

---

## 6. The Six Packages

### 6.1 packages/shared

The foundation package. Everything depends on it.

| Module | Source | Purpose |
|--------|--------|---------|
| Env validation | `src/env.ts` | Zod schema for all server env vars. `parseServerEnv()` validates at boot. |
| Encryption | `src/encryption.ts` | AES-256-GCM encrypt/decrypt for BYOK API keys. Uses `ENCRYPTION_SECRET`. |
| BYOK | `src/byok.ts` | BYOK provider registry types, `ProviderId` type. |
| Billing | `src/billing/features.ts` | Feature key definitions, `FREE_PLAN_ALERT_LIMIT=5`, `FREE_PLAN_JOURNAL_MONTHLY_LIMIT`, `hasFeature()`. |
| Billing index | `src/billing/index.ts` | Re-exports billing helpers. |
| Schemas | `src/schemas/` | Zod schemas for every data shape crossing package boundaries: alerts, biquote, briefings, calendar, candle, chat, decision-signals, indicator, journal, live-tick, news, noise-control, portfolio, sentiment, structure, tick, tool-outputs/*. |
| Symbols | `src/symbols.ts` | Supported symbol list, `isKnownSymbol()`, `SYMBOLS` constant. |
| Timeframes | `src/timeframes.ts` | Supported timeframe definitions. |
| Market phase | `src/market-phase.ts` | Session detection (Asian, London, NY). |
| Vault | `src/vault.ts` | GCP Secret Manager integration (hosted edition). |
| Errors | `src/errors.ts` | Standardized error codes, `providerUnavailable()`. |
| Logger | `src/logger.ts` | Structured logger (pino-based). |
| Tool IO | `src/ai/tool-io.ts` | Tool input/output type helpers. |
| Tool names | `src/ai/tool-names.ts` | Canonical tool name constants. |
| UI parts | `src/schemas/ui-parts.ts` | Maps tool names to UI component types. |

### 6.2 packages/db

Drizzle ORM schema and database client layer.

| Module | Source | Purpose |
|--------|--------|---------|
| Schema barrel | `src/schema/index.ts` | Exports all 50 table definitions from 33 schema files. |
| Schema files | `src/schema/*.ts` | 33 schema files defining 50 tables (excluding index.ts, _extensions.ts, enums.ts). |
| Client | `src/client.ts` | `getDb()` — returns Postgres client (production) or PGlite client (dev). Pool size via `DB_POOL_MAX` (default 5). |
| PGlite client | `src/pglite-client.ts` | Embedded Postgres via WASM. Stored in `.hamafx/data/`. Strips RLS, pgvector, GRANT statements from migrations. |
| Local DB | `src/local-db.ts` | Local dev DB initialization, auto-secret generation. |
| Billing queries | `src/queries/billing.ts` | `getSubscription()`, `isSubscriptionActive()`, `getEffectiveFeatures()`, `countActiveAlerts()`, `countJournalEntriesThisMonth()`. |
| Rate limiting | `src/rate-limit.ts` | `withRateLimit()` — per-user, per-action rate limiting via DB. |
| Active users | `src/active-users.ts` | Active user tracking. |
| User scope | `src/with-user-scope.ts` | `withTenantDb()` — sets `app.current_tenant` GUC for RLS. |
| Migrations | `drizzle/` | 52 SQL migration files (0000–0051). |
| Scripts | `scripts/` | `seed-plans.ts`, `migrate-status.mjs`, `install-extensions.mjs`, `list-tables.mjs`, `db-check.mjs`. |

### 6.3 packages/data

Market data provider abstraction with failover, caching, and health tracking.

| Module | Source | Purpose |
|--------|--------|---------|
| Public barrel | `src/index.ts` | Exports `getPrice`, `getCandles`, `fetchNews`, `fetchUpcomingEvents`, cache, failover, health. |
| Adapters | `src/adapters/` | `price.ts`, `candles.ts`, `news.ts`, `calendar.ts`, `storage.ts` — orchestrate providers with failover + caching. |
| Failover | `src/failover.ts` | `runWithFailover()` — health-aware provider ordering, pinned providers, error ranking. |
| Health | `src/health.ts` | `getHealth()`, `getScore()`, `recordSuccess()`, `recordFailure()` — per-provider health scoring. |
| Cache | `src/cache/` | Memory cache, Next.js `unstable_cache` integration, TTL policies, throttle. |
| Circuit breaker | `src/circuit-breaker.ts` | Per-provider circuit breaker. |
| Errors | `src/errors.ts` | `ProviderError`, `ProviderEmptyError`, `toAppError()`. |
| Providers | `src/providers/` | 8 provider directories: biquote, finnhub, marketaux, fred, binance, cftc, live-ticks, candles-1m. |

### 6.4 packages/ai

The AI agent core — chat orchestration, tools, routing, memory, persistence.

| Module | Source | Purpose |
|--------|--------|---------|
| Agent entry | `src/agent.ts` | `runChat()` — top-level orchestration: model selection, prompt assembly, tool wiring, budget guard, streaming. |
| Tools | `src/tools/` | 32 tool files + `index.ts` registry + `with-telemetry.ts` wrapper + `mutation-guard.ts`. |
| Routing | `src/routing.ts` | `routeTurn()` — domain-based model selection (fundamental/technical/summary/vision). |
| Model | `src/model.ts` | `resolveChatModel()`, `resolveOverrideModel()`, `derivePlannerModel()`, `deriveTitleModel()`, Vertex AI Google Search tool. |
| BYOK providers | `src/byok-providers.ts` | 9-provider registry: Google Gemini, OpenAI, Anthropic, Groq, DeepSeek, Mistral, OpenRouter, xAI, Vertex AI. |
| Planner | `src/planner.ts` | Plan-then-act pre-step — cheap model generates JSON execution plan. |
| System prompt | `src/prompt/system.ts` | System prompt assembly + `LiveSnapshot` type. |
| Context | `src/context.ts` | `buildLiveSnapshot()` — prices, session, health at turn start. |
| Memory | `src/memory/` | `memory-index.ts` (hybrid retrieval), `thread-summary.ts` (rolling compaction). |
| RAG | `src/rag.ts` | Retrieval-augmented generation via pgvector embeddings. |
| Embeddings | `src/embeddings.ts` | Embedding generation for news articles and memory. |
| Cost | `src/cost.ts` | `tryReserveBudget()`, `applyBudgetDelta()`, `estimateCostUsd()`, `BudgetExceededError`. |
| Fallback | `src/fallback.ts` | `classifyStreamError()`, `makeFallbackPart()`. |
| Multi-agent | `src/multi-agent/` | Committee deliberation: 5 agents (base, decision, fundamental, risk, sentiment, technical), orchestrator, stream, persistence. |
| Verification | `src/verification.ts` + `src/verification/` | `enforceCitations()` — post-finish fact-check for unsupported claims. |
| Telemetry | `src/instrumentation.ts` | Langfuse/OpenTelemetry integration. |
| Diagnostics | `src/diagnostics/` | `withDiagnostics()` (AsyncLocalStorage), `redactSecrets()`, `run-context.ts`. |
| Bot | `src/bot/` | Telegram bot: 16 commands, dispatcher, linking, types. |
| Telegram | `src/telegram/` | Telegram client, webhook handler, rate limiter, idempotency. |
| Alerts | `src/alerts/` | Alert evaluator, delivery, persistence, simulate. |
| Briefings | `src/briefings/` | Pre/post-event briefing generation + persistence. |
| Decision signals | `src/decision-signals/` | Signal extraction, evaluation, backtest engine, persistence. |
| Journal | `src/journal/` | Journal review (AI-powered). |
| Portfolio | `src/portfolio/` | Position service, risk service. |
| Sentiment | `src/sentiment/` | Social sentiment service. |
| Notifications | `src/notifications/` | Noise control, notification state. |
| Push | `src/push/` | Web push persistence + send. |
| Share | `src/share/` | Snapshot sharing, HMAC signing. |
| Snapshots | `src/snapshots/` | Daily HLOC + pivots + ATR computation. |
| Eval | `src/eval/` | AI eval harness: `runner.ts`, `cases.json`, `prompts.json`, `parse-stream.ts`. |
| Usage | `src/usage.ts` | Per-user AI usage tracking. |
| Rate limits | `src/rate-limits.ts` | AI-specific rate limiting. |
| Retry | `src/retry.ts` | Exponential backoff retry utility. |
| Cost | `src/cost.ts` | Budget guardrail. |
| Title | `src/title.ts` | Auto-title generation for chat threads. |

### 6.5 packages/indicators

Pure TypeScript technical indicators — no external dependencies except `@hamafx/shared`.

| Module | Source | Purpose |
|--------|--------|---------|
| ATR | `src/atr.ts` | Average True Range |
| Bollinger | `src/bollinger.ts` | Bollinger Bands |
| MACD | `src/macd.ts` | Moving Average Convergence Divergence |
| Moving averages | `src/moving-averages.ts` | SMA, EMA, WMA |
| Pivots | `src/pivots.ts` | Pivot points (classic, Camarilla, Woodie) |
| RSI | `src/rsi.ts` | Relative Strength Index |
| SMC | `src/smc/` | Smart Money Concepts: Asian range, FVG, liquidity, order blocks, PDH/PDL, structure, swings |
| Registry | `src/registry.ts` | Indicator registry — maps names to computation functions |

### 6.6 packages/config

Shared configuration — not compiled, consumed directly.

| Module | Purpose |
|--------|---------|
| `eslint/index.js` | Shared ESLint flat config |
| `prettier/index.js` | Shared Prettier config |
| `tailwind/tokens.ts` | Tailwind design tokens |
| `typescript/base.json` | Base tsconfig (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) |
| `typescript/nextjs.json` | Next.js tsconfig extension |
| `typescript/node.json` | Node.js tsconfig extension |

### 6.7 packages/test-utils

Shared test infrastructure.

| Module | Source | Purpose |
|--------|--------|---------|
| Factories | `src/factories/` | `candles.ts`, `threads.ts`, `users.ts` — test data factories |
| Mocks | `src/mocks/` | `db.ts`, `fetch.ts`, `llm.ts`, `server-only.ts` |
| Helpers | `src/helpers/` | `vitest-base.ts`, `vitest.ts` — shared vitest setup |

---

## 7. Deployment Modes — Hosted vs. Self-Hosted Split

The same codebase supports three deployment modes. The split is controlled by env vars, not code branches.

```
+---------------------------+---------------------------+---------------------------+
|     LOCAL NATIVE          |     LOCAL DOCKER          |     PRODUCTION             |
|     (pnpm dev:local)      |     (docker compose up)   |     (Vercel + GCE VM)      |
+---------------------------+---------------------------+---------------------------+
| DB: PGlite (WASM)         | DB: Postgres 16 + pgvector| DB: Supabase Postgres      |
|     .hamafx/data/         |     Docker volume         |     + pgvector             |
|     No pgvector           |     Full pgvector         |     Connection pooling     |
|     No RLS                |     RLS available         |     RLS via HAMAFX_ENABLE  |
|                           |                           |       _RLS=true            |
+---------------------------+---------------------------+---------------------------+
| Scheduler: node-cron      | Scheduler: node-cron      | Scheduler: systemd timers  |
|     (embedded in worker)  |     (embedded in worker)  |     (GCE VM)               |
|     + Vercel cron (1 job) |                           |     + Vercel cron (1 job)  |
+---------------------------+---------------------------+---------------------------+
| Secrets: auto-generated   | Secrets: .env file        | Secrets: GCP Secret        |
|     .hamafx/dev-secrets   |     Docker env_file       |     Manager + Vercel env   |
|     .json                 |                           |     (SECRETS_VAULT_PROVIDER|
|                           |                           |      =gcp-secret-manager)  |
+---------------------------+---------------------------+---------------------------+
| Auth: AUTH_MODE=legacy    | Auth: NextAuth v5         | Auth: NextAuth v5          |
|     (skips middleware)    |     (full multi-user)     |     (full multi-user)      |
|     __system__ user       |     MULTI_USER_ENABLED    |     MULTI_USER_ENABLED     |
+---------------------------+---------------------------+---------------------------+
| Billing: disabled         | Billing: available        | Billing: NOWPayments       |
|     (no NOWPAYMENTS keys) |     (if keys configured)  |     (sandbox → production) |
+---------------------------+---------------------------+---------------------------+
| HAMAFX_RUNTIME=local      | HAMAFX_RUNTIME=worker     | HAMAFX_RUNTIME= (unset)    |
|     (worker)              |     (worker)              |     Web on Vercel          |
|                           |                           |     Worker on GCE VM       |
+---------------------------+---------------------------+---------------------------+
```

**Key env vars controlling the split:**

| Env var | Local | Docker | Production |
|---------|-------|--------|------------|
| `HAMAFX_RUNTIME` | `local` | `worker` | unset (Vercel) / `worker` (GCE) |
| `AUTH_MODE` | `legacy` (dev only) | unset | unset |
| `MULTI_USER_ENABLED` | `0` | `0` or `1` | `1` |
| `BYOK_ENABLED` | `0` | `0` or `1` | `1` |
| `HAMAFX_ENABLE_RLS` | unset | unset | `true` |
| `ADMIN_DATABASE_URL` | unset | unset | set (hamafx_admin role) |
| `SECRETS_VAULT_PROVIDER` | unset | unset | `gcp-secret-manager` |
| `NOWPAYMENTS_API_BASE` | unset | sandbox | production |
| `DATABASE_URL` | unset (PGlite) | Docker Postgres | Supabase pooler URL |

---

## 8. AI Agent Pipeline — End-to-End

The chat flow from user message to streamed response:

1. **User sends message** → `POST /api/chat` (`apps/web/src/app/api/chat/route.ts`)
2. **Auth + rate limit** → `withAuth()` middleware, `withRateLimit(user.userId, 'ai_chat', 30)`
3. **Body validation** → Zod schema validates `threadId`, `messages`, `modelOverride`, `analysisMode`
4. **`runChat()`** (`packages/ai/src/agent.ts`) — the orchestration entry point:
   - **`buildLiveSnapshot()`** — fetches current prices, session phase, system health
   - **`compactThread()`** — rolling summary of prior messages to fit context window
   - **`tryReserveBudget()`** — atomic `INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap` against `daily_ai_spend` table. `MAX_DAILY_USD` env var (default: 5)
   - **`routeTurn()`** — picks model based on turn domain (fundamental/technical/summary/vision). See `packages/ai/src/routing.ts`
   - **`runPlanner()`** — for analytical turns, a cheap model generates a JSON execution plan, persisted as a system message, rendered as "Thinking" pill in UI
   - **`streamText()`** — Vercel AI SDK v5 streams the response, calling 32 tools as needed
   - **Tool execution** — each tool flows through `withTelemetry()` which writes a `chat_tool_telemetry` row. Tools use `getToolContext()` (AsyncLocalStorage) for threadId, env, signal, budget
   - **`enforceCitations()`** — post-finish fact-check: scans assistant turn for unsupported price/event claims, appends `citation-warning` part if model cites numbers without tool calls
   - **`applyBudgetDelta()`** — records actual cost against daily budget
   - **Auto-title** — `deriveTitleModel()` generates a title on first turn
5. **Stream back** — SDK's UI-message stream consumed by `useChat()` on the client

**Multi-agent committee** (optional, triggered by `convene_committee` tool or `analysisMode: 'full'`):
- 5 domain agents: `fundamental-agent`, `technical-agent`, `risk-agent`, `sentiment-agent`, `decision-agent`
- Each runs in parallel, produces an opinion (bias, confidence, reasoning)
- Orchestrator fuses opinions into a consensus grade (A/B/C/D/F)
- Opinions persisted to `agent_opinions` table, rendered as `agent-deliberation.tsx` UI part

---

## 9. Worker Architecture

```
+-------------------------------------------------------------------+
|                    WORKER PROCESS (apps/worker)                    |
|                                                                   |
|  +-----------------+  +-----------------+  +-------------------+  |
|  | SignalR Consumer|  | Binance WS      |  |                   |  |
|  | (BiQuote ticks) |  | (crypto klines) |  | (gold ticks)     |  |
|  | onTick → buffer |  | onTick → buffer |  | onTick → buffer  |  |
|  +--------+--------+  +--------+--------+  +--------+----------+  |
|           |                    |                    |             |
|           v                    v                    v             |
|  +----------------------------------------------------------------+ |
|  |                        TickBuffer                               | |
|  |            (flushes to live_ticks table at 1Hz)                 | |
|  +----------------------------------------------------------------+ |
|           |                                                       |
|           v                                                       |
|  +-----------------+  +-----------------+  +-------------------+  |
|  | Candle1mAggregator| | Healthchecks.io   |  |                   |  |
|  | (UPSERT on close)|  | (30s heartbeat)   |  |                   |  |
|  +-----------------+  +-----------------+  +-------------------+  |
|                                                                   |
|  +-----------------+  +-----------------+  +-------------------+  |
|  | Scheduler       |  | Job Runner CLI  |  | SD-Notify         |  |
|  | (node-cron,     |  | (systemd        |  | (READY/WATCHDOG   |  |
|  |  Docker mode)   |  |  one-shot mode) |  |  signals)         |  |
|  +-----------------+  +-----------------+  +-------------------+  |
+-------------------------------------------------------------------+
```

**Tick flow:**
1. SignalR consumer holds persistent connection to `https://biquote.io/hubs/tick`
2. Subscribes to XAUUSD, EURUSD, GBPUSD via `Subscribe(symbols[])`
3. `ReceiveTick` events validated against `BiquoteSignalRTickSchema` (Zod)
4. Normalized to `NormalizedTick` shape (symbol, bid, ask, mid, ts, source)
5. Fed to `TickBuffer` which batches and flushes to `live_ticks` table at 1Hz
6. `Candle1mAggregator` consumes the same tick stream, builds 1m OHLC candles
7. On candle close, UPSERTs to `candles_1m` table

**Reconnection:** `apps/worker/src/signalr/reconnect.ts` — jittered exponential backoff with configurable delay sequence.

---

## 10. Known Gaps & Divergences from Hybrid Vision

These are current-state facts, not aspirations. Each gap is documented honestly.

### 10.1 RLS Not Enforced by Default

RLS policies exist (migrations 0035–0039) but enforcement requires `HAMAFX_ENABLE_RLS=true`. Self-hosters using PGlite have no RLS at all (PGlite strips RLS statements from migrations). The `organization` and `organization_member` tables exist in `schema/auth.ts` but are scaffolding for future org-level multi-tenancy, not actively used for data isolation.

### 10.2 Billing in Sandbox Mode

NOWPayments integration is fully wired but `.env.example` defaults `NOWPAYMENTS_API_BASE` to `https://api-sandbox.nowpayments.io`. The billing webhook safety gate (`docs/archive/BILLING-WEBHOOK-SAFETY-GATE.md`) defines hard requirements (dead-letter queue, Sentry capture, paging) that must be met before paid plans go live. The cutover runbook prerequisites are unchecked.

### 10.3 Auth Hardening Completed

The auth system has been hardened. Key fixes implemented:
- `tokenVersion` checked in the `session()` callback every 5 minutes — invalidates sessions on mismatch
- Signed `x-user-id` header (HMAC-SHA256) for route defense-in-depth
- Account lockout after 5 failed attempts (15-min timeout)
- TOTP 2FA enforced at login
- `userSessions` table for active session tracking with revoke support

### 10.4 Data Provider Licensing Unresolved

No `TERMS.md`, `LICENSE-NOTICES.md`, or provider terms files exist in the repo. The legal compliance review (`docs/archive/review/11-legal-compliance-review.md`) covers this extensively but is an audit doc, not a compliance doc. Redistribution licensing for paying subscribers is unresolved.

### 10.5 AlphaVantage and Trading Economics — Referenced but No Provider Directory

`ALPHAVANTAGE_API_KEY` and `TRADING_ECONOMICS_KEY` appear in `.env.example` but no provider implementation directories exist under `packages/data/src/providers/`. These may be planned or legacy references.

---

## 11. Key Patterns

### 11.1 Failover Everywhere
`runWithFailover([{name, run()}])` with health-aware provider ordering. Pinned providers (live_ticks, candles_1m) keep position regardless of health score. `ProviderEmptyError` bypasses health-failure writes.

### 11.2 Atomic Budget Guard
`tryReserveBudget()`: single `INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap` against `daily_ai_spend` table. Concurrent turns at 99% cap serialize correctly.

### 11.3 Zod at Boundaries
Every data shape crossing package boundaries validates through `@hamafx/shared` schemas. Tool inputs → `InputSchema`, tool outputs → `ToolOutputMap`.

### 11.4 AsyncLocalStorage for Context
`withToolContext()` eliminates global state. Each tool call has threadId, env, signal, budget snapshot via `getToolContext()`.

### 11.5 Plan-Then-Act
For fundamental/technical turns: cheap model generates JSON plan, persisted as system message, rendered as "Thinking" pill in UI.

### 11.6 Citation Enforcement
`enforceCitations()` scans every assistant turn for unsupported price/event claims. Appends `data-citation-warning` part if model cites numbers without tool calls.

### 11.7 PGlite Compatibility
PGlite strips `CREATE EXTENSION vector`, RLS policies, `GRANT` statements, and `HNSW` indexes from migrations. Vector columns fall back to `real[]`. New DB features must work without pgvector.
