<p align="center">
  <img src="./docs/assets/dashboard_preview.jpg" alt="HamaFX-Ai Dashboard Preview" width="100%">
</p>

<h1 align="center">HamaFX-Ai</h1>

<p align="center">
  <strong>The Open-Source, Multi-Tenant AI Trading Copilot.</strong><br>
  <sub>Chat-driven · Mobile-first · Multi-Agent Deliberation · BYOK · Self-hostable</sub>
</p>

<p align="center">
  <a href="https://github.com/HamaFx/HamaFX-Ai/actions/workflows/ci-fast.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/HamaFx/HamaFX-Ai/ci-fast.yml?style=for-the-badge&logo=vitest&logoColor=white&label=CI" alt="CI Status">
  </a>
  <a href="https://github.com/HamaFx/HamaFX-Ai/actions/workflows/ci-slow.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/HamaFx/HamaFX-Ai/ci-slow.yml?style=for-the-badge&logo=github&logoColor=white&label=E2E" alt="E2E Status">
  </a>
  <a href="https://github.com/HamaFx/HamaFX-Ai/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/HamaFx/HamaFX-Ai?style=for-the-badge&color=8a93a3" alt="License">
  </a>
  <br>
  <a href="https://github.com/HamaFx/HamaFX-Ai">
    <img src="https://img.shields.io/github/stars/HamaFx/HamaFX-Ai?style=for-the-badge&color=FFD700&logo=star&logoColor=white" alt="Stars">
  </a>
  <a href="https://github.com/HamaFx/HamaFX-Ai/forks">
    <img src="https://img.shields.io/github/forks/HamaFx/HamaFX-Ai?style=for-the-badge&color=blue&logo=githubforks&logoColor=white" alt="Forks">
  </a>
  <a href="https://github.com/HamaFx/HamaFX-Ai/issues">
    <img src="https://img.shields.io/github/issues/HamaFx/HamaFX-Ai?style=for-the-badge&color=orange" alt="Issues">
  </a>
  <a href="https://github.com/HamaFx/HamaFX-Ai/pulls">
    <img src="https://img.shields.io/github/issues-pr/HamaFx/HamaFX-Ai?style=for-the-badge&color=blueviolet" alt="Pull Requests">
  </a>
  <br>
  <a href="https://www.npmjs.com/package/pnpm">
    <img src="https://img.shields.io/badge/pnpm-9.15.4-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm">
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/Node.js-%E2%89%A520.11-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  </a>
  <a href="https://nextjs.org">
    <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js" alt="Next.js 15">
  </a>
  <a href="https://www.typescriptlang.org">
    <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  </a>
  <a href="https://tailwindcss.com">
    <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4">
  </a>
</p>

<p align="center">
  <a href="#-features">✨ Features</a> ·
  <a href="#-quick-start">🚀 Quick Start</a> ·
  <a href="#-architecture">🏗️ Architecture</a> ·
  <a href="#-ai-agent--32-tools">🤖 AI Agent</a> ·
  <a href="#-multi-agent-deliberation">🧠 Multi-Agent</a> ·
  <a href="#-tech-stack">📦 Tech Stack</a> ·
  <a href="#-documentation">📚 Docs</a> ·
  <a href="#-self-hosting">🐳 Self-Hosting</a> ·
  <a href="#-roadmap--known-gaps">🗺️ Roadmap</a> ·
  <a href="#-contributing">Contributing</a>
</p>

---

## ✨ Features

HamaFX-Ai is an **autonomous AI trading companion that lives in your pocket**. Chat with it about gold (XAU/USD) and forex markets like you'd talk to a seasoned macro fund trader — it monitors live tick feeds, executes structural charting math, checks macroeconomic calendars, and drafts risk-verified trade plans.

| | Feature | What it does |
|---|---------|-------------|
| 💬 | **Chat-First Workflow** | Every feature — charting, alerts, journal, risk — is controllable through conversation. Deep-linked system prompts start targeted analyses instantly. |
| 📊 | **Hybrid Charting Engine** | Toggles on the fly between **TradingView Pro** widget and **Lightweight-charts** with SMC (Smart Money Concepts) overlay indicators. |
| 🧠 | **Plan-Then-Act Reasoning** | Analytical queries generate a visible execution plan ("Thinking" pill) before tools are called — so you see *why* the agent is doing what it's doing. |
| 🏛️ | **Multi-Agent Committee** | 5 specialist agents (Technical, Fundamental, Risk, Sentiment, Decision) evaluate in parallel and fuse into a consensus grade (A/B/C/D/F). |
| 🔐 | **Bring Your Own Key (BYOK)** | Zero vendor lock-in. Connect Gemini, Claude, OpenAI, Groq, DeepSeek, Mistral, OpenRouter, xAI, or Vertex AI keys — encrypted at rest with **AES-256-GCM**. |
| 📱 | **Progressive Web App** | Mobile-first, installable on iOS/Android. Sub-second loads, virtualized feeds, SWR caching, web push notifications, offline fallback. |
| 🟢 | **Zero-Database Dev** | PGlite (embedded Postgres via WASM) boots the entire stack in <5 seconds. No database to install, no Docker required. |
| 📡 | **Live Tick Pipeline** | BiQuote SignalR WebSocket + Binance WS + TwelveData WS + MT5 Bridge → 1Hz tick buffer → 1m candle aggregation. |
| 🔄 | **Provider Failover** | Health-aware failover across 8 market data providers with circuit breakers, adaptive throttling, and pinned primary sources. |
| ⚡ | **Budget Guardrail** | Atomic `INSERT..ON CONFLICT` daily spend cap (`MAX_DAILY_USD`). Concurrent turns at 99% cap serialize correctly. |
| 🛡️ | **Citation Enforcement** | Post-finish fact-check scans every assistant turn for unsupported price/event claims and flags them. |
| 🤖 | **Telegram Bot** | 16 bot commands — alert, analyze, ask, calendar, chart, committee, news, price, positions, and more — with rate limiting and idempotency. |

---

## 🚀 Quick Start

> **Prerequisites:** [Node.js v20+](https://nodejs.org/), [pnpm v9+](https://pnpm.io/). That's it — no database required for local dev.

### Option 1: Native PGlite (Zero-Setup)

```bash
git clone https://github.com/HamaFx/HamaFX-Ai.git
cd HamaFX-Ai
pnpm install
echo 'GOOGLE_GENERATIVE_AI_API_KEY=AIza...' >> .env.local
pnpm dev:local
```

> [!TIP]
> Open `http://localhost:3000`, register at `/register`, and connect your API keys on the `/onboarding` screen. Auth secrets, encryption keys, and cron tokens are **auto-generated** to `.hamafx/dev-secrets.json` on first boot.

### Option 2: Docker Compose (Full Features)

<details>
<summary><b>🐳 Click to expand Docker setup</b></summary>

```bash
git clone https://github.com/HamaFx/HamaFX-Ai.git
cd HamaFX-Ai
cp .env.example .env

# Generate required secrets
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(16).toString('hex'))"

# Fill in .env with the generated secrets + at least one AI provider key
nano .env

# Start all services (Postgres 16 + pgvector, Langfuse, web app, worker)
docker compose up -d
```

| Service | Port | Purpose |
|---------|------|---------|
| `db` | 5432 | Postgres 16 + pgvector |
| `langfuse` | 3001 | LLM observability UI |
| `app` | 3000 | Next.js web app |
| `worker` | 8081 | Worker daemon (SignalR + jobs) |

</details>

> [!NOTE]
> Docker Compose includes PostgreSQL 16 with `pgvector` for full RAG/memory support. Vector features are disabled under PGlite local dev.

---

## 🏗️ Architecture

```
+---------------------------------------------------------------------------+
|                              BROWSER (PWA)                                 |
|                                                                           |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  | Chat UI           |  | Chart Engine      |  | Dashboard / Settings  |  |
|  | (useChat stream)  |  | (TradingView +    |  | (TanStack Query/SWR)  |  |
|  | 39 tool UI parts  |  |  lightweight-charts)| | 29 pages, 10 widgets |  |
|  +--------+----------+  +--------+----------+  +----------+------------+  |
+-----------+----------------------+-----------------------+---------------+
            |                      |                       |
            v                      v                       v
+---------------------------------------------------------------------------+
|                        VERCEL — apps/web (Next.js 15)                      |
|                                                                           |
|  +------------------+  +------------------+  +---------------------------+|
|  | Edge Middleware  |  | /api/chat        |  | /api/market/*             ||
|  | (auth + CSRF)    |  | runChat()        |  | @hamafx/data              ||
|  | JWT + request-id |  | streamText + 32  |  | BiQuote->Finnhub failover ||
|  +------------------+  | tools            |  +---------------------------+|
|                        +--------+---------+  +---------------------------+|
|  +------------------+           |            | /api/billing/*            ||
|  | /api/cron/* (12) |  +--------+---------+  | /api/telegram/webhook    ||
|  | Bearer-gated     |  | /api/auth/*      |  | /api/bot/*                ||
|  +------------------+  | NextAuth v5      |  +---------------------------+|
+---------------------------------------------------------------------------+
            |                                          |
+---------------------------------------------------------------------------+
|                    GCE VM — hamafx-cron (e2-medium)                        |
|                                                                           |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  | SignalR Consumer  |  | Candle Aggregator |  | systemd timers        |  |
|  | (BiQuote ticks)   |  | (1m OHLC from     |  | (8 heavy jobs +       |  |
|  | TickBuffer -> DB  |  |  tick stream)     |  |  4 light cron pokes)  |  |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  +-------------------+  +-------------------+  +-----------------------+  |
|  | Binance WS        |  | TwelveData WS     |  | MT5 Bridge            |  |
|  | (crypto ticks)    |  | (gold ticks)      |  | (TCP:8080)            |  |
|  +-------------------+  +-------------------+  +-----------------------+  |
+---------------------------------------------------------------------------+
```

### Monorepo Layout

```
HamaFX-Ai/
├── apps/
│   ├── web/              # Next.js 15 PWA (29 pages, 78 API routes)
│   └── worker/           # Node.js daemon (SignalR, ticks, jobs)
├── packages/
│   ├── ai/               # 32 tools, routing, multi-agent, memory, persistence
│   ├── data/             # 8 market data providers, failover, caching
│   ├── db/               # 46 tables, 42 migrations, Postgres + PGlite
│   ├── indicators/       # RSI, MACD, ATR, Bollinger, SMC structure
│   ├── shared/           # Zod schemas, env validation, AES-256-GCM encryption
│   ├── config/           # ESLint, Prettier, TypeScript configs
│   └── test-utils/       # Test factories, mocks, vitest helpers
├── docs/                 # 8 technical docs + archived legacy docs
├── infra/cron-vm/        # GCE VM setup + 22 systemd timers + backup scripts
├── tools/                # MT5 bridge (MQL5) + Lighthouse
└── scripts/              # dev.ts, predeploy-migrate.mjs
```

**Dependency chain:** `config` → `shared` → `db` + `indicators` → `data` → `ai` → `web` + `worker`

---

## 🤖 AI Agent & 32 Tools

The agent core (`packages/ai/`) uses Vercel AI SDK v5 with domain-based model routing, plan-then-act reasoning, citation enforcement, and a daily budget guardrail.

### Routing

```
Incoming Turn
     |
     +-- Classify Intent
     |     +--> Fundamental  (macro, news, events)      --> strong model
     |     +--> Technical    (indicators, structure)    --> fast model
     |     +--> Summary      (brief chats, status)      --> fast model
     |     +--> Vision       (chart screenshots)        --> vision model
     |     +--> Simple       (generic fallback)          --> lite model
     |
     +-- Execute Plan ("Thinking" pill)
           +--> Assemble Context -> Pull Memory/RAG -> Run Verification
```

### The 32 Tools

<details>
<summary><b>🔍 Expand the full 32 tools matrix</b></summary>

| Domain | Tools | Description |
|:---|:---|:---|
| **📈 Live Data** | `get_price` · `get_candles` · `get_indicators` · `get_market_structure` · `get_session_levels` | Real-time prices, historical candles, indicator math, SMC structures, session ranges |
| **🔬 Analysis** | `analyze_technical` · `analyze_fundamental` · `analyze_chart_image` · `annotate_chart` | Technical scans, macro evaluations, vision chart reads, visual annotations |
| **🌐 Macro & Vol** | `get_news` · `get_calendar` · `get_correlation` · `get_intermarket` · `get_seasonality` · `get_cot` · `forecast_volatility` · `get_intermarket_resonance` | News, economic events, cross-correlations, seasonality, CoT reports, volatility forecasts |
| **⚖️ Risk & Backtest** | `compute_risk` · `compute_position_health` · `verify_call` · `replay_setup` | Position sizing, trade health, compliance verification, historical replay |
| **🧠 Memory & RAG** | `search_knowledge` · `summarize_thread` | pgvector embedding search, conversation compaction |
| **✏️ Write Actions** | `set_alert` · `log_journal` · `get_journal_stats` · `share_snapshot` | Alerts, journal entries, performance stats, shareable snapshots |
| **🏛️ Deliberation** | `convene_committee` · `get_system_diagnostics` · `run_system_action` | Multi-agent committee, system health, verified actions |
| **📊 Portfolio & Sentiment** | `get_portfolio_snapshot` · `get_social_sentiment` | Portfolio state, retail/social sentiment |

</details>

---

## 🧠 Multi-Agent Deliberation

Five specialist agents analyze in parallel, then a **Decision Agent** fuses their opinions into a final response with a consensus grade.

| Mode | Agents | Latency | Cost | Use Case |
|:---|:---|:---|:---|:---|
| **Auto** | AI picks | varies | varies | Default — auto-detects from question |
| **Single** | 1 (no committee) | ~2s | 1× | Quick questions |
| **Quick** | Technical → Decision | ~3s | 1.5× | "What's the price of gold?" |
| **Standard** | Technical + Fundamental → Decision | ~5s | 2.5× | "Analyze XAUUSD" |
| **Full** | Technical + Fundamental + Risk + Sentiment → Decision | ~8s | 4× | "Should I buy XAUUSD now?" |

```
User Message
     |
     v
  Mode Router
     |
     v
+------------------------------------------------------------------+
|  PARALLEL EXECUTION (Promise.all)                                 |
|                                                                  |
|  +----------+  +-------------+  +--------+  +-----------+        |
|  |Technical |  |Fundamental  |  | Risk   |  | Sentiment |        |
|  | Agent    |  | Agent       |  | Agent  |  | Agent     |        |
|  +----+-----+  +------+------+  +---+----+  +-----+-----+        |
|       |               |             |              |             |
|       +-------+-------+------+------+--------------+             |
|               |                                             |
|               v                                             |
|        +----------+                                         |
|        | Decision |                                         |
|        | Agent    |  --> Fused response + consensus grade   |
|        +----------+                                         |
+------------------------------------------------------------------+
```

**Key behaviors:**
- **Veto enforcement** — Risk agent's `hardVeto` blocks buy recommendations
- **Per-agent model overrides** — assign different models to each agent in Settings
- **Opinion persistence** — all opinions saved to `agent_opinions` table
- **Error fallback** — if a specialist fails, Decision proceeds with available opinions
- **Budget guardrails** — cost estimated upfront, reserved before pipeline starts

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript 5.7 (strict, `exactOptionalPropertyTypes`) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| AI | Vercel AI SDK v5 + 9-provider BYOK registry |
| Database | Postgres (Supabase) + pgvector · Drizzle ORM |
| Local DB | PGlite (embedded Postgres via WASM) |
| Charts | TradingView lightweight-charts v5 + TradingView Pro widget |
| Worker | Node.js daemon (esbuild bundled) |
| Scheduler | node-cron (Docker) / systemd timers (production) |
| Monorepo | Turborepo 2 + pnpm 9.15.4 |
| Testing | Vitest (90+ files, 590+ cases) + Playwright E2E |
| Observability | Sentry · Langfuse (self-hosted) · healthchecks.io |
| CI/CD | GitHub Actions (7 workflows) + Changesets |
| Container | Docker (multi-stage, Trivy-scanned, GHCR) |

---

## 📚 Documentation

The full documentation set lives in [`docs/`](docs/). Every claim is verified against the actual codebase.

| Doc | Read when |
|-----|-----------|
| [**01 — Architecture**](docs/01-architecture.md) | You want to understand the system design, deployment modes, and worker architecture |
| [**02 — Data Flows**](docs/02-data-flows.md) | You need to understand data providers, AI providers, failover, or licensing |
| [**03 — Backend & API**](docs/03-backend-api.md) | You're working on API routes, database schema, or migrations |
| [**04 — Frontend & UX**](docs/04-frontend-ux.md) | You're working on pages, components, charts, or PWA features |
| [**05 — Security & Auth**](docs/05-security-auth-compliance.md) | You're touching auth, encryption, RLS, billing, or compliance |
| [**06 — Deployment**](docs/06-deployment-self-hosting.md) | You're deploying, self-hosting, or setting up CI/CD |
| [**07 — Agent Guide**](docs/07-agent-understanding.md) | You're an AI coding agent about to work on this repo |
| [**08 — Setup & Run**](docs/08-agent-setup-run.md) | You need to set up a dev environment or fix a startup issue |

**Community docs:** [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [SUPPORT.md](SUPPORT.md) · [CHANGELOG.md](CHANGELOG.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

## 🐳 Self-Hosting

HamaFX-Ai is designed to ship from **one codebase** serving both a hosted SaaS and self-hosted deployments. The split is controlled by environment variables — no code branches.

| Mode | Database | Scheduler | Setup |
|------|----------|-----------|-------|
| **Local native** | PGlite (embedded) | node-cron (embedded) | `pnpm dev:local` |
| **Docker** | Postgres 16 + pgvector | node-cron (embedded) | `docker compose up -d` |
| **Production** | Supabase Postgres | systemd timers (GCE VM) | Vercel + GCE VM |

See [docs/06-deployment-self-hosting.md](docs/06-deployment-self-hosting.md) for the complete self-hosting guide and [docs/08-agent-setup-run.md](docs/08-agent-setup-run.md) for the full environment variable reference (78 vars documented).

<details>
<summary><b>📋 Minimum env vars for self-hosting</b></summary>

```bash
# Required
AUTH_SECRET=<32-byte hex>          # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET=<32-byte hex>    # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET=<16+ chars>            # node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
GOOGLE_GENERATIVE_AI_API_KEY=AIza...  # Or AI_GATEWAY_API_KEY

# Recommended
MULTI_USER_ENABLED=1               # Enable multi-user registration
BYOK_ENABLED=1                     # Enable Bring Your Own Key
NEXTAUTH_URL=http://localhost:3000 # Your deployment URL

# Data providers (optional but recommended)
FINNHUB_API_KEY=...
MARKETAUX_API_KEY=...
FRED_API_KEY=...
TWELVEDATA_API_KEY=...
```

</details>

---

## 🗺️ Roadmap & Known Gaps

We document gaps honestly — not as aspirations, but as current-state facts.

| Gap | Severity | Status |
|-----|----------|--------|
| Token version not checked in JWT callback | 🔴 Critical | Unfixed — sessions not invalidated after password change |
| `__system__` user assumption in cron jobs | 🔴 Critical | Unfixed — can bypass tenant scoping in multi-tenant mode |
| Deleted users retain valid JWTs until expiry | 🟠 High | Unfixed |
| RLS enforcement off by default | 🟡 Medium | By design — set `HAMAFX_ENABLE_RLS=true` to enable |
| Billing in sandbox mode | 🟡 Medium | NOWPayments wired but production cutover prerequisites unchecked |
| Data provider licensing unresolved | 🟠 High | No terms files in repo — legal review needed before redistributing data |
| AlphaVantage / Trading Economics env vars without implementations | 🔵 Low | Stale references in `.env.example` |

See [docs/05-security-auth-compliance.md](docs/05-security-auth-compliance.md) §4 for full details on auth bugs and [CHANGELOG.md](CHANGELOG.md) for the complete known gaps table.

---

## 🔧 CLI Commands

<details>
<summary><b>🛠️ Expand command reference</b></summary>

```bash
# Development
pnpm dev:local                    # Local dev (PGlite, zero setup)
pnpm dev                          # Dev with remote DB (turbo run dev)

# Testing
pnpm turbo run test -- --run      # All packages
pnpm --filter @hamafx/web test    # Single package
pnpm --filter @hamafx/web exec playwright test  # E2E

# Quality
pnpm typecheck                    # TypeScript check
pnpm lint                         # ESLint
pnpm format                       # Prettier write
pnpm turbo run build              # Build all

# Database
pnpm --filter @hamafx/db migrate:gen     # Generate migration
pnpm --filter @hamafx/db migrate:apply   # Apply migrations
pnpm --filter @hamafx/db seed:plans      # Seed billing plans

# AI Evals (manual, requires running app)
pnpm --filter @hamafx/ai eval -- --base-url http://localhost:3000 \
  --cookie "authjs.session-token=..." --cases

# Docker
docker compose up -d              # Start all services
docker compose logs -f app        # Follow web logs
docker compose down               # Stop all
```

</details>

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide — prerequisites, coding conventions, testing, how to add tools/tables/routes/providers, and the release process.

| Resource | Link |
|----------|------|
| Contributing Guide | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Code of Conduct | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| Security Policy | [SECURITY.md](SECURITY.md) |
| Support | [SUPPORT.md](SUPPORT.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |
| Bug Report | [Issue Template](.github/ISSUE_TEMPLATE/bug_report.yml) |
| Feature Request | [Issue Template](.github/ISSUE_TEMPLATE/feature_request.yml) |

---

## ⚖️ License

Licensed under the [Apache License, Version 2.0](LICENSE).

<p align="center">
  <sub>Built for gold and forex traders. Designed for autonomous coding agents. Self-hostable by anyone.</sub>
</p>
