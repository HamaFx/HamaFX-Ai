# HamaFX-Ai

> A **personal** AI trading copilot for **XAUUSD (primary), EURUSD, GBPUSD** — focused, mobile-first, and chat-driven.

Built for a single user. The agent has full context over live price action, multi-timeframe charts, technical indicators, fundamental data, curated news, your own journal, and prior briefings.

**Status**: Phases 0 → 8 shipped. The agent now plans, verifies, and remembers; the data layer stays fresh under provider stress with stale-while-revalidate, health-aware failover, and adaptive throttling. Phase 8 added a GCE worker that holds a persistent BiQuote SignalR connection — sub-second prices in `live_ticks`, six heavy jobs migrated off Vercel onto systemd timers, nightly off-site backups + weekly verified restore, server-only Sentry on both deploys. See [`docs/10-roadmap.md`](./docs/10-roadmap.md) for the full feature ledger.

---

## What it does (today)

**Chat-first, with 26 tools the agent calls on demand**

- **Live data** — `get_price`, `get_candles`, `get_indicators`, `get_market_structure`
- **Macro** — `get_news`, `get_calendar`, `get_correlation`, `get_intermarket`, `get_seasonality`, `get_cot`, `forecast_volatility`
- **Trading** — `compute_risk`, `get_session_levels`, `compute_position_health`, `replay_setup`, `verify_call`
- **Analysis** — `analyze_technical`, `analyze_fundamental`, `analyze_chart_image`, `annotate_chart`
- **Memory** — `search_knowledge` (hybrid dense + Postgres FTS, time-decayed), `summarize_thread`
- **Mutations** — `set_alert`, `log_journal`, `share_snapshot`

**Per-domain model routing** picks the right tier per turn:

| Turn type | Default model |
| --- | --- |
| Fundamental analysis | `google-vertex/gemini-2.5-pro` |
| Technical analysis | `google-vertex/gemini-2.5-flash` |
| News / calendar / journal summary | `google-vertex/gemini-2.5-flash` |
| Vision | `google-vertex/gemini-2.5-pro` |
| Title / generic | `google-vertex/gemini-2.5-flash-lite` / `2.5-flash` |

**Plan-then-act**: analytical turns emit a collapsible "Thinking" pill above the answer.
**Verification**: a `verify_call` tool re-checks geometry + opposing liquidity; a post-finish citation enforcer flags prices/events not backed by a tool call.
**Memory**: news, journal entries, briefings, and saved thread synopses are all retrievable via `search_knowledge` with a `kinds` filter.

---

## TL;DR

| Concern          | Choice                                                              |
| ---------------- | ------------------------------------------------------------------- |
| Framework        | Next.js 15 (App Router) + React 19 + TypeScript                     |
| Styling          | Tailwind CSS v4 + `shadcn/ui` (Radix) + `tailwind-variants`         |
| Charts           | TradingView **lightweight-charts** + optional Pro widget            |
| AI               | Vercel **AI SDK v5** + Vercel AI Gateway / direct Vertex AI         |
| State (server)   | TanStack Query                                                      |
| State (client)   | Zustand + URL state (`nuqs`)                                        |
| Live prices      | Persistent BiQuote SignalR (worker) → `live_ticks` Postgres snapshot; REST polling fallback every 1.5s with stale-while-revalidate cache (Phase 8 PR-6/7/8) |
| Market data      | BiQuote (primary) + Finnhub (fallback) — health-aware failover; Twelve Data retired in Phase 8 PR-19   |
| News             | Finnhub news (primary) + Marketaux (fallback)                       |
| Macro / calendar | FRED + Trading Economics                                            |
| DB               | **Supabase Postgres** (free tier) + `pgvector`                      |
| ORM              | Drizzle                                                             |
| Cache            | Next.js Data Cache (no Upstash needed) with SWR + single-flight     |
| Cron             | systemd timers on a GCE e2-medium worker VM; light `/api/cron/*` pokers + 6 heavy worker-resident jobs (Phase 8) |
| Auth             | Single **`APP_PASSWORD`** env + HMAC-signed cookie + middleware     |
| Hosting          | **Vercel** — single deploy                                          |
| Monorepo         | pnpm workspaces + Turborepo                                         |

> Single-user app. **No per-user rate limiting, no RLS, no GDPR/exports, no analytics, no eval CI.**
> Manual eval via `pnpm --filter ai eval -- --cases` runs the 15-case acceptance suite with tool-trace assertions.

---

## Quickstart

### Option 1: Docker (recommended — everything included)

```bash
git clone https://github.com/HamaFx/HamaFX-Ai
cd HamaFX-Ai
cp .env.example .env          # add your API keys
docker compose up -d           # starts Postgres + app
# Open http://localhost:3000
```

Includes Postgres + pgvector — no external database needed. All features work.

### Option 2: Native (zero setup, no Docker)

```bash
git clone https://github.com/HamaFx/HamaFX-Ai
cd HamaFX-Ai
pnpm install
pnpm dev:local                 # one command — DB auto-creates
# Open http://localhost:3000
```

Uses embedded PGlite (Postgres in-process). No Postgres install needed.  
Migrations run automatically on first boot. Everything just works.

### Option 3: Production (Vercel + GCE VM)

See [`docs/09-deployment.md`](./docs/09-deployment.md) for the full cloud deployment guide.

---

**What you need to provide:** API keys for AI (Gemini/OpenAI) and data providers  
(Finnhub is free). Copy `.env.example` to `.env` and fill in what you have — the  
app tells you which keys are missing at startup.

**Type-check + test + lint everything**:

```bash
pnpm turbo run typecheck
pnpm turbo run test
pnpm turbo run lint
```

**Run the eval against a deploy**:

```bash
pnpm --filter ai eval -- \
  --base-url https://your-deploy.vercel.app \
  --cookie "hfx_auth=..." \
  --cases \
  --out docs/eval
```

---

## Documentation Map

The docs are numbered for reading order. Each file is self-contained and cross-links to the others.

1. [`docs/00-overview.md`](./docs/00-overview.md) — Vision, scope, success metrics
2. [`docs/01-architecture.md`](./docs/01-architecture.md) — System architecture (with diagrams)
3. [`docs/02-tech-stack.md`](./docs/02-tech-stack.md) — Tech choices and rationale
4. [`docs/03-project-structure.md`](./docs/03-project-structure.md) — Monorepo layout and naming
5. [`docs/04-features.md`](./docs/04-features.md) — Feature catalog (Phase 1 → 7)
6. [`docs/05-ui-ux.md`](./docs/05-ui-ux.md) — Mobile-first design, navigation, theming
7. [`docs/06-data-sources.md`](./docs/06-data-sources.md) — Provider matrix, caching, health
8. [`docs/07-ai-agent.md`](./docs/07-ai-agent.md) — Routing, tools, planner, verifier, memory
9. [`docs/08-backend-and-api.md`](./docs/08-backend-and-api.md) — API routes (Vercel-only)
10. [`docs/09-deployment.md`](./docs/09-deployment.md) — Vercel + GCE-VM cron, envs, CI
11. [`docs/10-roadmap.md`](./docs/10-roadmap.md) — Phase 0 → 7 with checkboxes
12. [`docs/11-conventions.md`](./docs/11-conventions.md) — Code style, naming, AI-friendly conventions
13. [`docs/12-security-and-config.md`](./docs/12-security-and-config.md) — Secrets, password gate, guardrails
14. [`docs/13-data-flow.md`](./docs/13-data-flow.md) — Sequence diagrams for key flows
15. [`docs/14-ai-agent-handoff.md`](./docs/14-ai-agent-handoff.md) — How AI coding agents should read & extend this repo

`/infra/cron-vm/` — GCE VM setup script + crontab + README for the cron scheduler.
`.kiro/steering/` — area-specific rules autoloaded by Kiro/Claude/Cursor agents working on this repo.
