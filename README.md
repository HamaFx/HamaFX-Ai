# HamaFX-Ai

> A **personal** AI trading copilot for **XAUUSD (primary), EURUSD, GBPUSD** — focused, mobile-first, and chat-driven.
> Built for one user (you). The agent has full context over live price action, multi-timeframe charts, technical indicators, fundamental data, and curated news.

This repository currently contains **planning only** (no code yet).
All architectural and implementation decisions live in [`/docs`](./docs).

---

## TL;DR

| Concern             | Choice                                                                |
| ------------------- | --------------------------------------------------------------------- |
| Framework           | Next.js 15 (App Router) + React 19 + TypeScript                       |
| Styling             | Tailwind CSS v4 + `shadcn/ui` (Radix) + `tailwind-variants`           |
| Charts              | TradingView **lightweight-charts**                                    |
| AI                  | Vercel **AI SDK v5** with tool-loop agent + AI Gateway                |
| State (server)      | TanStack Query                                                        |
| State (client)      | Zustand + URL state (`nuqs`)                                          |
| Live prices         | TanStack Query polling REST every 1–2 s (no WS for MVP)               |
| Market data         | Twelve Data (primary) + Finnhub (fallback) + Alpha Vantage (backup)   |
| News                | Marketaux (primary) + Finnhub news                                    |
| Macro / calendar    | Trading Economics + FRED                                              |
| DB                  | **Supabase Postgres** (free tier) + `pgvector` — used as a plain DB   |
| ORM                 | Drizzle                                                               |
| Cache               | Upstash Redis (free tier) — caching only, no rate-limit / queue       |
| Cron                | **Vercel Cron Jobs** for news + calendar ingestion                    |
| Auth                | Single **`APP_PASSWORD`** env + custom login page → signed cookie     |
| Hosting             | **Vercel** only — single deploy                                       |
| Monorepo            | pnpm workspaces + Turborepo                                           |

> **No separate worker service** at MVP. We can add a Fly.io worker later *only if* we ever need a persistent upstream WebSocket.
> **No per-user rate limiting, no RLS, no GDPR/exports, no analytics, no eval CI** — this is a single-user app.

---

## Documentation Map

The docs are numbered for reading order. Each file is self-contained and cross-links to the others.

1. [`docs/00-overview.md`](./docs/00-overview.md) — Vision, scope, success metrics
2. [`docs/01-architecture.md`](./docs/01-architecture.md) — System architecture (with diagrams)
3. [`docs/02-tech-stack.md`](./docs/02-tech-stack.md) — Tech choices and rationale
4. [`docs/03-project-structure.md`](./docs/03-project-structure.md) — Monorepo layout and naming
5. [`docs/04-features.md`](./docs/04-features.md) — Feature catalog (MVP → v2)
6. [`docs/05-ui-ux.md`](./docs/05-ui-ux.md) — Mobile-first design, navigation, theming
7. [`docs/06-data-sources.md`](./docs/06-data-sources.md) — Provider matrix, endpoints, caching
8. [`docs/07-ai-agent.md`](./docs/07-ai-agent.md) — Agent architecture, tools, memory, RAG
9. [`docs/08-backend-and-api.md`](./docs/08-backend-and-api.md) — API routes (Vercel-only)
10. [`docs/09-deployment.md`](./docs/09-deployment.md) — Vercel + Vercel Cron, envs, simple CI
11. [`docs/10-roadmap.md`](./docs/10-roadmap.md) — Phased roadmap (MVP → v1 → v2)
12. [`docs/11-conventions.md`](./docs/11-conventions.md) — Code style, naming, AI-friendly conventions
13. [`docs/12-security-and-config.md`](./docs/12-security-and-config.md) — Secrets, password gate, basic guardrails
14. [`docs/13-data-flow.md`](./docs/13-data-flow.md) — Sequence diagrams for key flows
15. [`docs/14-ai-agent-handoff.md`](./docs/14-ai-agent-handoff.md) — How other AI agents should read & extend this repo

---

## Status

**Phase**: 📐 Planning — personal-mode simplifications applied. Not yet implemented.
Next step: scaffold the monorepo per `docs/03-project-structure.md` and start `Phase 0` in `docs/10-roadmap.md`.
