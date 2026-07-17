# K6 Load Testing — Implementation Log

> Generated: 2026-07-17
> Tracking work order status for the k6 load testing suite.

| Work Order | Status | Commit SHA | Notes |
|------------|--------|------------|-------|
| K0.1 | DONE | — | Scaffolded loadtest/ project skeleton (package.json, tsconfig.json, .gitignore) |
| K0.2 | DONE | — | Kept loadtest/ out of pnpm workspace; added root .gitignore entries |
| K0.3 | DONE | — | Created README.md stub with k6 v0.57+ binary requirement |
| K1.1 | DONE | — | config/environments.ts — central env resolution from __ENV |
| K1.2 | DONE | — | config/thresholds.ts — reusable SLO presets (market_read, read_mix, chat, stress) |
| K1.3 | DONE | — | config/load-profiles.ts — reusable executor presets (smoke/avg/stress/spike/soak) |
| K1.4 | DONE | — | lib/metrics.ts — custom Trend/Rate/Counter definitions |
| K1.5 | DONE | — | lib/checks.ts — reusable check helpers + 429 recording |
| K1.6 | DONE | — | lib/auth.ts — both auth strategies (legacy + NextAuth session) |
| K1.7 | DONE | — | lib/http.ts — authed request wrappers with tagging + metrics |
| K1.8 | DONE | — | lib/data/symbols.json — valid market symbols (XAUUSD, EURUSD, GBPUSD) |
| K1.9 | DONE | — | lib/seed/seed-users.mjs — Node seeding script for Strategy B |
| K2.1 | DONE | — | scenarios/market-read.ts — weighted market_read GET mix |
| K2.2 | DONE | — | scenarios/read-mix.ts — broad read surface (market+news+calendar+sentiment+threads+health) |
| K2.3 | DONE | — | scenarios/chat.ts — guarded chat POST scenario |
| K3.1 | DONE | — | tests/smoke-market-read.ts + tests/smoke-read-mix.ts — 1 VU, 3 iterations |
| K4.1 | DONE | — | tests/load-market-read.ts + tests/load-read-mix.ts — ramping-arrival-rate avg load |
| K5.1 | DONE | — | tests/stress-market-read.ts — ramping steps to find ceiling |
| K6.1 | DONE | — | tests/spike-read-mix.ts — sharp 0→peak→0 surge |
| K6.2 | DONE | — | tests/soak-read-mix.ts — constant-arrival-rate for long duration |
| K7.1 | DONE | — | tests/load-chat.ts — guarded (K6_ENABLE_CHAT=true), low concurrency |
| K8.1 | DONE | — | docker-compose.loadtest.yml — throwaway SUT with AUTH_MODE=legacy + lifted limits |
| K9.1 | DONE | — | .github/workflows/loadtest.yml — manual dispatch + nightly cron |
| K10.1 | DONE | — | lib/summary.ts — standardized handleSummary (JSON + JUnit XML) |
| K11.1 | DONE | — | loadtest/README.md — full run guide, env var reference, auth strategies |
| K11.2 | DONE | — | docs/09-testing.md — added "Load & Performance Testing (k6)" section |
