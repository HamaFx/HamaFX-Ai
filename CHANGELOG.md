# Changelog

All notable changes to HamaFX-Ai are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** Starting from the documentation overhaul (2026-07-04), this changelog
> is maintained manually for user-facing changes. Internal package versioning is
> handled by [Changesets](https://github.com/changesets/changesets) — see
> [CONTRIBUTING.md](CONTRIBUTING.md) §9 for the release process.

---

## [Unreleased]

### Added
- **Documentation overhaul:** 8 new docs replacing the old 15-doc set:
  - `docs/01-architecture.md` — system design, deployment modes, architecture diagrams
  - `docs/02-data-flows.md` — all data/AI providers, failover, sequence diagrams, licensing
  - `docs/03-backend-api.md` — 78 API routes, 46-table ER reference, 42 migrations
  - `docs/04-frontend-ux.md` — 29 pages, chart engine, 39 chat tool UI parts, PWA
  - `docs/05-security-auth-compliance.md` — auth flow, BYOK encryption, RLS, known bugs
  - `docs/06-deployment-self-hosting.md` — production topology, CI/CD, testing, incident response
  - `docs/07-agent-understanding.md` — AI agent guide, 32 tools, domain vocabulary, high-risk areas
  - `docs/08-agent-setup-run.md` — setup guide, env vars, common failures, debugging
- **Advanced community docs:** `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`
- 35 legacy docs archived to `docs/archive/` (preserved for history)

### Changed
- `AGENTS.md` deleted — replaced by `docs/07-agent-understanding.md` + `docs/08-agent-setup-run.md`
- Old numbered docs (01–15) removed from `docs/` root — archived to `docs/archive/`
- Old review/audit docs removed from `docs/review/` — archived to `docs/archive/review/`
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `DESIGN_SYSTEM_AND_UX_ROADMAP.md` removed from root — archived (new versions written)

### Security
- Documented known auth bugs in `docs/05-security-auth-compliance.md` §4:
  - Token version not checked in JWT callback (Critical)
  - `__system__` user assumption in cron jobs (Critical)
  - Session validation gaps for deleted users (High)
- Documented data provider licensing gaps — no terms files exist in repo

---

## [0.0.0] — Pre-release

HamaFX-Ai is in pre-release development. The project has shipped through Phases 0–9 plus UX upgrade Phases A–E, but has not yet tagged a formal release.

### Shipped Features (cumulative)

**Phase 0–1:** Project scaffolding, Turborepo monorepo, Next.js 15 PWA, PGlite local dev, Drizzle ORM schema, BiQuote REST provider, Finnhub fallback, basic chat with AI SDK.

**Phase 2:** Alert system, trading journal, economic calendar (FRED), news feed (Marketaux), dashboard with widgets, chart engine (TradingView + lightweight-charts).

**Phase 3:** Multi-user auth (NextAuth v5), BYOK (9-provider registry, AES-256-GCM encryption), web push (VAPID), PWA service worker, CSP headers, CSRF protection, account lockout.

**Phase 4–5:** Security hardening, soft-delete, Postgres enums, FTS, observability (Sentry, Langfuse), incident response playbook, backup/restore scripts.

**Phase 6–7:** AI agent expansion — 32 tools, plan-then-act, citation enforcement, budget guardrail, tool telemetry, multi-agent committee (5 agents), decision signal tracking, intermarket resonance, social sentiment, portfolio management.

**Phase 8:** Worker daemon (SignalR consumer, tick buffer, 1m candle aggregator), Binance WS consumer, systemd timers (22 units), healthchecks.io integration, GCE VM infra, self-update mechanism.

**Phase 9:** Multi-tenant v2 — RLS foundation (migrations 0035–0039), BYPASSRLS admin role, tenant constraints, NOWPayments billing (plans, subscriptions, payments, IPN webhook), billing gate (feature gating).

**UX Phases A–E:** Institutional terminal UI redesign, chat UX overhaul, 39 tool UI parts, settings redesign, onboarding flow, dashboard widgets.

### Known Gaps (as of documentation overhaul)

| Gap | Severity | Status |
|-----|----------|--------|
| Auth: token version not checked in JWT callback | Critical | Unfixed |
| Auth: `__system__` user in cron jobs | Critical | Unfixed |
| Auth: deleted users retain valid sessions | High | Unfixed |
| RLS enforcement off by default | Medium | By design — `HAMAFX_ENABLE_RLS=true` to enable |
| Billing in sandbox mode | Medium | Production cutover prerequisites unchecked |
| Data provider licensing unresolved | High | No terms files in repo — legal review needed |
| AlphaVantage / Trading Economics env vars without provider implementations | Low | Stale references in `.env.example` |
| `AUTH_FIX_PLAN.md` referenced but never created | Low | Auth bugs documented in `docs/05-security-auth-compliance.md` §4 |

---

## How This Changelog Is Maintained

- **User-facing changes** (features, breaking changes, security fixes) are recorded here manually
- **Package versioning** is automated via Changesets — the `release.yml` workflow creates version PRs
- **Internal refactors** that don't affect users are not logged here (see git history)
- Each entry links to the relevant PR or commit when available
