<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)">
    <h1>🥇 HamaFX-Ai</h1>
  </picture>
</p>

<p align="center">
  <strong>The Open-Source, Multi-User AI Trading Platform.</strong><br>
  Chat-driven. Mobile-first. Built for gold & forex.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-production%20ready-48d597?style=flat-square" alt="Status: Production Ready">
  <img src="https://img.shields.io/badge/tests-350+-48d597?style=flat-square" alt="Tests: 350+">
  <img src="https://img.shields.io/badge/ai%20tools-32-f5b945?style=flat-square" alt="AI Tools: 32">
  <img src="https://img.shields.io/badge/license-Apache%202.0-8a93a3?style=flat-square" alt="License">
</p>

<br>

---

## ✨ What It Does

An **AI agent that lives in your pocket** — chat with it about gold and forex markets like you'd talk to a veteran trader. It sees live prices, reads charts, scans news, crunches indicators, and remembers everything you've discussed.

| | | |
|---|---|---|
| 💬 **Chat-first** | Every feature reachable via natural conversation | 
| 📊 **Live charts** | Multi-timeframe candlesticks with 12+ indicators |
| 🧠 **AI agent** | 32 tools, domain-routed models, plan-then-act reasoning |
| 📰 **News & macro** | Curated headlines, economic calendar, sentiment analysis |
| 📓 **Trade journal** | Log trades, track R-multiples, review patterns |
| ⚡ **Smart alerts** | Price crosses, candle closes, indicator signals — email + push |
| 🔍 **Memory & RAG** | Hybrid vector search over news, journal, briefings |
| 🏛️ **Committee** | Multi-agent deliberation — Economist, Technician, Risk Manager |
| ✅ **Verification** | Post-turn fact-checking — never hallucinates prices |
| 📱 **PWA ready** | Install on your phone, works offline |

---

## 🚀 Quick Start

### <picture><source><img width="20" alt="Docker" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/docker/docker-original.svg"></picture> Docker — recommended

```bash
git clone https://github.com/HamaFx/HamaFX-Ai
cd HamaFX-Ai
cp .env.example .env          # add your API keys
docker compose up -d
# → http://localhost:3000
```

> Postgres 16 + pgvector included. All features work out of the box.

### <picture><source><img width="20" alt="Node" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nodejs/nodejs-original.svg"></picture> Native — zero setup

```bash
git clone https://github.com/HamaFx/HamaFX-Ai
cd HamaFX-Ai
pnpm install
echo 'GOOGLE_GENERATIVE_AI_API_KEY=*** >> .env.local
pnpm dev:local
# → http://localhost:3000
```

> Embedded PGlite — Postgres runs in-process. No installs, no config. Migrations auto-run. **Secrets are auto-generated on first boot** — only `GOOGLE_GENERATIVE_AI_API_KEY` (or any AI provider key) is required to get a working chat. Sign up via `/auth/register` then connect a provider at `/onboarding`. PGVector features need Docker.

### <picture><source><img width="20" alt="Cloud" src="https://raw.githubusercontent.com/devicons/devicon/master/icons/googlecloud/googlecloud-original.svg"></picture> Cloud — production

See **[docs/08-deployment.md](docs/08-deployment.md)** for Vercel + GCE VM deployment.

---

## 🧱 Architecture

```
Browser (PWA)
    │
    ├── /api/chat ──▶ runChat() ──▶ streamText + 32 tools
    │                    │           domain routing + planner + memory
    │                    │           budget guard + citation enforcement
    │
    ├── /api/market/* ──▶ data layer ──▶ BiQuote → Finnhub failover
    │
    └── Middleware ──▶ password gate · CSRF · Edge runtime

Worker (GCE VM)
    │
    ├── SignalR consumer ──▶ TickBuffer ──▶ live_ticks (1 Hz)
    ├── Candle aggregator ──▶ candles_1m (minute bars)
    └── systemd timers ──▶ 7 heavy jobs + light HTTP pokers
```

| Package | Role | LOC |
|---------|------|-----|
| `@hamafx/ai` | Agent core — chat, 32 tools, routing, RAG | 16,957 |
| `@hamafx/data` | Market adapters — 5 providers, cache, failover | 5,920 |
| `@hamafx/web` | Next.js 15 PWA — chat, charts, journal, alerts | 26,434 |
| `@hamafx/db` | Drizzle ORM — 22 tables, Postgres + PGlite | 2,178 |
| `@hamafx/indicators` | Pure TS indicators — classic + Smart Money Concepts | 2,271 |
| `@hamafx/shared` | Zod schemas, types, env, errors | 4,276 |
| `@hamafx/worker` | Node daemon — SignalR, jobs, scheduler | 4,896 |

---

## 🤖 AI Agent — 32 Tools

| Category | Tools |
|----------|-------|
| 📈 **Live Data** | `get_price` · `get_candles` · `get_indicators` · `get_market_structure` · `get_session_levels` |
| 🔬 **Analysis** | `analyze_technical` · `analyze_fundamental` · `analyze_chart_image` · `annotate_chart` |
| 🌐 **Macro** | `get_news` · `get_calendar` · `get_correlation` · `get_intermarket` · `get_seasonality` · `get_cot` · `forecast_volatility` · `get_intermarket_resonance` |
| ⚖️ **Risk** | `compute_risk` · `compute_position_health` · `verify_call` · `replay_setup` |
| 🧠 **Memory** | `search_knowledge` · `summarize_thread` |
| ✍️ **Actions** | `set_alert` · `log_journal` · `get_journal_stats` · `share_snapshot` |
| 🏛️ **Meta** | `convene_committee` · `get_system_diagnostics` · `run_system_action` |

**Per-domain model routing** auto-picks the right brain for each question:

| Question type | Model |
|---------------|-------|
| Fundamental (why is gold moving?) | Gemini 2.5 Pro |
| Technical (what are the levels?) | Gemini 2.5 Flash |
| News / calendar / summary | Gemini 2.5 Flash |
| Chart image analysis | Gemini 2.5 Pro |
| Quick / simple | Gemini 2.5 Flash-Lite |

---

## 🛠️ Tech Stack

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js" alt="Next.js 15">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS v4">
  <img src="https://img.shields.io/badge/AI_SDK-v5-000?style=for-the-badge&logo=vercel" alt="AI SDK v5">
  <img src="https://img.shields.io/badge/Gemini-2.5-4285F4?style=for-the-badge&logo=google" alt="Gemini">
  <img src="https://img.shields.io/badge/Postgres-pgvector-4169E1?style=for-the-badge&logo=postgresql" alt="Postgres">
  <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle" alt="Drizzle">
  <img src="https://img.shields.io/badge/pnpm-9-F69220?style=for-the-badge&logo=pnpm" alt="pnpm">
  <img src="https://img.shields.io/badge/Vitest-tests-6E9F18?style=for-the-badge&logo=vitest" alt="Vitest">
</p>

**Stack highlights:**

- **Framework:** Next.js 15 App Router · React 19 · Edge middleware
- **Styling:** Tailwind CSS v4 · shadcn/ui (Radix) · `motion` animations
- **Charts:** TradingView lightweight-charts v5
- **AI:** Vercel AI SDK v5 · Google Vertex AI · AI Gateway
- **DB:** Postgres (Supabase) · pgvector · Drizzle ORM · PGlite (local dev)
- **Build:** pnpm workspaces · Turborepo · esbuild (worker)
- **Auth:** NextAuth.js v5 · CSRF · BYOK (Bring Your Own Key) per user
- **Testing:** Vitest · Playwright · 72 test files · 394 cases

---

## 📚 Documentation

For **AI agents** working on this codebase, start with [`AGENTS.md`](docs/AGENTS.md).

| Doc | Topic |
|-----|-------|
| [AGENTS.md](docs/AGENTS.md) | AI agent quickstart — commands, patterns, pitfalls |
| [01-architecture.md](docs/01-architecture.md) | System design & deployment modes |
| [02-codebase.md](docs/02-codebase.md) | Monorepo structure, conventions, extension rules |
| [03-ai-agent.md](docs/03-ai-agent.md) | Agent internals — runChat, 32 tools, routing, memory |
| [04-data-layer.md](docs/04-data-layer.md) | DB schema, 5 providers, caching, failover |
| [05-api-routes.md](docs/05-api-routes.md) | All 37 API endpoints, auth, middleware, cron |
| [06-frontend.md](docs/06-frontend.md) | Pages, chat UI, charts, PWA, state management |
| [07-worker.md](docs/07-worker.md) | Worker daemon, SignalR, 7 jobs, systemd |
| [08-deployment.md](docs/08-deployment.md) | Production cloud deployment |
| [09-testing.md](docs/09-testing.md) | Test patterns, CI, eval harness |
| [10-self-hosting.md](docs/10-self-hosting.md) | Multi-tenant Self-hosting guide |
| [11-contributing-guide.md](docs/11-contributing-guide.md) | Architecture deep dive for contributors |

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) for more details on how to get started.

---

## 🔧 Development

```bash
pnpm turbo run test -- --run    # 350+ tests
pnpm typecheck                  # strict TS across 8 packages
pnpm --filter @hamafx/web build # production build
pnpm turbo run lint             # ESLint flat config

# AI eval harness (requires running server)
pnpm --filter @hamafx/ai eval -- \
  --base-url http://localhost:3000 \
  --cookie "hfx_auth=..." \
  --cases
```

---

## ⚡ Design Principles

1. **Chat is the primary surface** — if a feature isn't reachable via chat, it doesn't ship
2. **Mobile-first, always** — designed for phones, enhanced for desktops
3. **Show the work** — every opinion backed by indicators, candles, or headlines
4. **No hallucinated prices** — numbers always come from tool results, never free-form
5. **AI-agent-friendly codebase** — files, naming, and docs optimized for autonomous coding agents
6. **Multi-user by design** — BYOK architecture with strict tenant isolation.

---

<p align="center">
  <sub>Built for gold traders. Optimized for AI agents. Deploy in one command.</sub>
</p>