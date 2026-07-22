# HamaFX-Ai Architecture Knowledge Base

> **Auto-generated**: 2026-07-22T23:54:34.148Z
> **Schema version**: 1.0
> **Purpose**: AI-agent-optimized architecture overview for rapid project understanding

---

## Project Overview

**HamaFX-Ai** is an open-source (Apache-2.0), multi-tenant, chat-driven AI trading copilot for forex instruments: **XAUUSD** (primary), **EURUSD**, **GBPUSD**.

- **Stack**: Next.js 15 (App Router) + React 19 + TypeScript (strict)
- **AI**: Vercel AI SDK v5, Google Vertex AI + 9-provider BYOK registry
- **Database**: PostgreSQL (Supabase) + pgvector, Drizzle ORM (49+ tables)
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy)
- **Charts**: TradingView lightweight-charts v5
- **Monorepo**: pnpm workspaces + Turborepo 2

## Monorepo Structure

| Package | Path | Type | Purpose |
|---------|------|------|---------|
| **root** | `root` | package | Package: root (3 nodes) |
| **@hamafx/web** | `packages/web` | package | Package: @hamafx/web (644 nodes) |
| **@hamafx/worker** | `packages/worker` | package | Package: @hamafx/worker (58 nodes) |
| **docs** | `docs` | package | Package: docs (1 nodes) |
| **infra** | `infra` | package | Package: infra (1 nodes) |
| **loadtest** | `loadtest` | package | Package: loadtest (31 nodes) |
| **@hamafx/ai** | `packages/ai` | package | Package: @hamafx/ai (273 nodes) |
| **@hamafx/config** | `packages/config` | package | Package: @hamafx/config (4 nodes) |
| **@hamafx/data** | `packages/data` | package | Package: @hamafx/data (64 nodes) |
| **@hamafx/db** | `packages/db` | package | Package: @hamafx/db (154 nodes) |
| **@hamafx/indicators** | `packages/indicators` | package | Package: @hamafx/indicators (39 nodes) |
| **@hamafx/shared** | `packages/shared` | package | Package: @hamafx/shared (84 nodes) |
| **@hamafx/test-utils** | `packages/test-utils` | package | Package: @hamafx/test-utils (19 nodes) |
| **scripts** | `scripts` | package | Package: scripts (7 nodes) |
| **tool:architecture-explorer** | `tools/architecture-explorer` | package | Package: tool:architecture-explorer (17 nodes) |
| **tool:lighthouse** | `tools/lighthouse` | package | Package: tool:lighthouse (2 nodes) |

**Dependency chain**: `config → shared → db + indicators → data → ai → web + worker`

**Total**: 16 packages, **1401** architecture nodes

## Architecture Layers

1. **Presentation** (`@hamafx/web`) — Next.js 15 PWA, React 19, Tailwind CSS v4, shadcn/ui, TradingView charts
2. **API Gateway** (`@hamafx/web` middleware) — NextAuth JWT, CSRF, rate limiting, 184 API routes
3. **AI Agent** (`@hamafx/ai`) — Chat routing, plan-then-act, 32 tools, 4 agents, memory, citations
4. **Data** (`@hamafx/data`) — Provider failover, caching (SWR), throttling, BiQuote→Finnhub
5. **Persistence** (`@hamafx/db`) — Drizzle ORM, 49+ tables, Postgres (Supabase) + PGlite
6. **Worker** (`@hamafx/worker`) — SignalR consumer, TickBuffer, Candle1mAggregator, 7+ cron jobs
7. **Infrastructure** — Vercel (web) + GCE VM (worker), Docker Compose, systemd timers

## Key Design Patterns

1. **Provider Failover** — `runWithFailover()` with health-aware ordering, pinned providers, quota-aware error ranking
2. **SWR** — Stale-while-revalidate at every layer of the data pipeline
3. **Atomic Budget Guard** — Single `INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap`
4. **Plan-Then-Act** — Cheap model generates JSON plan before expensive model runs tools
5. **Citation Enforcement** — Post-finish scan for unsupported claims
6. **Plugin Registry** — Self-registering tools via singleton ToolRegistry with per-plan gating
7. **DI Container** — Injectable db/llmClient for testability
8. **Rolling Thread Summary** — Compacts older messages into system prompt

## AI Agent Architecture

### Single-Agent Pipeline
User Message → Rate Limit → Thread Check → Budget Guard → History Load → Thread Compaction → Domain Routing → Model Resolution → Planner (if needed) → Tool Filtering → streamText (max 5 retries) → Citation Check → Budget Reconcile → Auto-Title

### Multi-Agent Committee
4 specialist agents (Technical, Fundamental, Risk, Sentiment) + 1 Decision synthesizer. Modes: quick (1 agent), standard (2), full (4, queued to worker via analysis_jobs table).

### 32 AI Tools
- **analyze_chart_image** — Copyright 2026 HamaFX
- **analyze_fundamental** — Aggregate the upcoming high/medium-impact macro events for a symbol
- **analyze_technical** — Multi-timeframe technical readout (trend, bias, momentum, structure, levels) for a symbol. Use for any 
- **annotate_chart** — Copyright 2026 HamaFX
- **compute_position_health** — For each currently-open journal entry, compute live P/L in pips and R-multiples plus distance to stop and target. Use when the user asks 
- **compute_risk** — Compute position size, USD risk/reward, and pips-to-stop/target from a (symbol, side, entry, stop, target?, accountUsd, riskPct) tuple. Pure-function — no provider calls. Use when the user asks 
- **convene_committee** — Convene a Multi-Agent Trading Committee (Economist, Technician, Risk Manager) to evaluate a trade setup. Use whenever the user asks 
- **forecast_volatility** — Copyright 2026 HamaFX
- **get_calendar** — Copyright 2026 HamaFX
- **get_candles** — Fetch OHLC candles for one symbol at one timeframe (e.g. XAUUSD 1h). Use to confirm a recent swing high/low or to feed a pattern read. For RSI/MACD/EMA/etc. prefer get_indicators.
- **get_correlation** — Pearson correlation matrix over close-to-close returns for XAUUSD/EURUSD/GBPUSD at the given timeframe + window, plus a USD-strength proxy (
- **get_co_t** — Last N weeks of CFTC Commitment-of-Traders rows for one symbol (default XAUUSD). Use to answer 
- **get_indicators** — Compute indicators (sma, ema, rsi, macd, atr, bollinger, pivots) on a (symbol, timeframe) window. Returns the last 30 points of each series — enough for 
- **get_intermarket_resonance** — Evaluate Gold (XAUUSD) or major currencies
- **get_intermarket** — Cross-asset pulse: USD-strength proxy + 24h change, gold
- **get_journal_stats** — Copyright 2026 HamaFX
- **get_market_structure** — Copyright 2026 HamaFX
- **get_news** — Copyright 2026 HamaFX
- **get_portfolio_snapshot** — Get a snapshot of the user\
- **get_price** — Fetch the most recent mid price for one or more supported symbols (XAUUSD, EURUSD, GBPUSD). Use only when the LIVE_SNAPSHOT in the system prompt is missing the symbol or older than 10 seconds.
- **get_seasonality** — Per-month / per-weekday / per-hour return seasonality for a symbol. Returns median percent return, IQR, win rate, and sample count per bucket. Use for 
- **get_session_levels** — Compute today
- **get_social_sentiment** — Copyright 2026 HamaFX
- **get_system_diagnostics** — Query the real-time operational health, connection latency, database record volumes, active synchronized files status, remaining daily budget, and verified environment variables in the Copilot system.
- **log_journal** — Record a trade entry in the journal. Returns the new entry id + a summary line. Status is 
- **replay_setup** — Copyright 2026 HamaFX
- **run_system_action** — Trigger the operator-only FRED resonance historical sync. This tool is only for explicit user requests to run the resonance backfill/sync and is unavailable for canned cache or migration theatrics.
- **search_knowledge** — Copyright 2026 HamaFX
- **set_alert** — Create a one-shot price / indicator / candle-close alert. Fires when the rule first matches and then deactivates. The user can resend by editing the alert in /alerts.
- **share_snapshot** — Copyright 2026 HamaFX
- **summarize_thread** — One-paragraph synopsis of the active chat thread plus three durable insights. Use when the user asks 
- **verify_call** — Copyright 2026 HamaFX

### Model Routing
- **Domains**: fundamental, technical, summary, vision, generic
- **Tiers**: fast (technical/sentiment), mid (fundamental/risk), strong (decision)
- **BYOK**: 9 providers (google, anthropic, openai, groq, deepseek, xai, openrouter, github, cerebras)

## API Surface

184 routes across major domains:
- **/src**: 184 endpoints

## Database

49+ tables in PostgreSQL (Supabase) + pgvector:
- **agent_opinions** (15 columns)
- **alerts** (11 columns)
- **analysis_jobs** (21 columns)
- **audit_logs** (6 columns)
- **user** (47 columns)
- **organization** (42 columns)
- **organization_member** (38 columns)
- **user_sessions** (37 columns)
- **account** (37 columns)
- **session** (34 columns)
- **verificationToken** (33 columns)
- **user_settings** (32 columns)
- **user_symbols** (5 columns)
- **plans** (39 columns)
- **subscriptions** (34 columns)
- **payments** (23 columns)
- **ipn_events** (9 columns)
- **bot_links** (5 columns)
- **briefings_emitted** (6 columns)
- **economic_events** (14 columns)
- ... and 29 more tables

## Analysis Summary


- **Circular Dependencies**: 6
- **Architecture Hotspots**: 50
- **Dead Code / Orphans**: 1098
- **Shared Utilities**: 40
- **Average Coupling**: 0.22
- **Max Dependency Chain**: 3 hops


## External Integrations

| Provider | Type | Protocol | Role |
|----------|------|----------|------|
| BiQuote | Market Data | SignalR | Primary live ticks |
| Binance | Market Data | WebSocket | Crypto klines |
| Finnhub | Market Data | REST | Fallback provider |
| Supabase | Database | PostgreSQL | Primary DB hosting |
| Vercel | Hosting | HTTP | Web application |
| GCE VM | Hosting | SSH | Worker daemon |
| Google Vertex AI | AI | API | Default AI model |
| Sentry | Monitoring | API | Error tracking |
| Langfuse | Observability | API | LLM tracing |
| NOWPayments | Billing | REST | Crypto payments |
| Telegram | Bot | Webhook | Bot platform |
