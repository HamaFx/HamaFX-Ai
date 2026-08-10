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

> The upcoming public OSS release is a single-user, self-hosted BYOK preview. Shared multi-user/RLS mode and hosted billing are not part of this release.

### Added
- **Documentation overhaul:** current procedural docs for the single-user OSS release, replacing the old 15-doc set:
  - `docs/01-architecture.md` — system design and deployment modes
  - `docs/02-data-flows.md` — provider flows and licensing responsibilities
  - `docs/03-backend-api.md` — API architecture and route-boundary rules
  - `docs/04-frontend-ux.md` — frontend architecture and UX requirements
  - `docs/05-security-auth-compliance.md` — auth, BYOK encryption, RLS, and self-hosting security
  - `docs/06-deployment-self-hosting.md` — deployment entry point
  - `docs/07-agent-understanding.md` — coding-agent guide
  - `docs/08-agent-setup-run.md` — setup and troubleshooting
  - `docs/14-oss-release-checklist.md` — public-release boundary and operator checklist
- **Advanced community docs:** `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`
- Legacy documentation references were removed from the public guide; the current procedural docs live in `docs/`.

### Changed
- `AGENTS.md` deleted — replaced by `docs/07-agent-understanding.md` + `docs/08-agent-setup-run.md`
- Old numbered and review/audit docs were replaced by the current procedural documentation set.
- Community security and contribution guides were refreshed for the OSS release.

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

**Phase 0–1:** Project scaffolding, Turborepo monorepo, Next.js 16 PWA, PGlite local dev, Drizzle ORM schema, BiQuote REST provider, Finnhub fallback, basic chat with AI SDK.

**Phase 2:** Alert system, trading journal, economic calendar (FRED), news feed (Marketaux), dashboard with widgets, chart engine (TradingView + lightweight-charts).

**Phase 3:** Multi-user auth (NextAuth v5), BYOK (10-provider registry, AES-256-GCM encryption), web push (VAPID), PWA service worker, CSP headers, CSRF protection, account lockout.

**Phase 4–5:** Security hardening, soft-delete, Postgres enums, FTS, observability (Sentry, Langfuse), incident response playbook, backup/restore scripts.

**Phase 6–7:** AI agent expansion — 32 registered tools, plan-then-act, citation enforcement, budget guardrail, tool telemetry, multi-agent committee (5 agents), decision signal tracking, intermarket resonance, social sentiment, portfolio management.

**Phase 8:** Worker daemon (SignalR consumer, tick buffer, 1m candle aggregator), Binance WS consumer, systemd timers (22 units), healthchecks.io integration, GCE VM infra, self-update mechanism.

**Phase 9:** Multi-tenant v2 — RLS foundation (migrations 0035–0039), BYPASSRLS admin role, tenant constraints, NOWPayments billing (plans, subscriptions, payments, IPN webhook), billing gate (feature gating).

**UX Phases A–E:** Institutional terminal UI redesign, chat UX overhaul, 39 tool UI parts, settings redesign, onboarding flow, dashboard widgets.

### Release boundary and remaining considerations

| Area | Current OSS status |
|-----|--------------------|
| Shared RLS/multi-user mode | Intentionally blocked until every user-data query establishes tenant context and the PostgreSQL isolation suite passes |
| Hosted billing | Separate hosted-product track; not enabled as a self-hosted OSS service |
| Data provider licensing | Each operator must review provider terms and obtain any required redistribution rights |
| Disaster recovery | Docker backup/restore is smoke-tested; operators must still configure off-host copies and rehearse recovery |
| Secret rotation | Guarded maintenance utility exists; operators must stop writers and retain recovery material |

---

## How This Changelog Is Maintained

- **User-facing changes** (features, breaking changes, security fixes) are recorded here manually
- **Package versioning** is automated via Changesets — the `release.yml` workflow creates version PRs
- **Internal refactors** that don't affect users are not logged here (see git history)
- Each entry links to the relevant PR or commit when available
