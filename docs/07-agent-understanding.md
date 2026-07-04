# 07 — Agent Understanding Guide

> **Version:** 2026-07-04 · **Verified against:** commit `1803c17` (main)
> **Purpose:** Everything an AI coding agent needs before touching this codebase.
> **Cross-references:** [01-architecture.md](./01-architecture.md) · [08-agent-setup-run.md](./08-agent-setup-run.md)

---

## 1. Project Purpose

HamaFX-Ai is an open-source, multi-tenant, chat-driven AI trading copilot for forex instruments — primarily **XAUUSD** (gold), **EURUSD**, and **GBPUSD**. Users chat with an AI agent about markets, and the agent uses 32 tools to fetch real-time prices, analyze charts, check economic calendars, evaluate risk, convene multi-agent committees, and more.

The project ships from one codebase serving two identities:
- **Hosted SaaS** — subscription product on Vercel + GCE VM + Supabase
- **Self-hosted** — anyone can clone and run via Docker Compose or PGlite

**License:** Apache-2.0
**Repo:** `github.com/HamaFx/HamaFX-Ai`

---

## 2. Architecture Overview

Read [01-architecture.md](./01-architecture.md) for the full architecture. Summary:

- **Turborepo monorepo** (pnpm 9.15.4, Node ≥20.11)
- **2 apps:** `apps/web` (Next.js 15 PWA), `apps/worker` (Node.js daemon)
- **6 packages:** `shared`, `db`, `data`, `indicators`, `ai`, `config` + `test-utils`
- **Dependency chain:** `config` → `shared` → `db` + `indicators` → `data` → `ai` → `web` + `worker`
- **46 DB tables**, 42 migrations, 78 API routes, 29 frontend pages, 32 AI tools

---

## 3. Domain Vocabulary

### 3.1 Trading Terms

| Term | Meaning |
|------|---------|
| XAUUSD | Gold spot price vs USD (primary instrument) |
| EURUSD | Euro vs USD |
| GBPUSD | British Pound vs USD |
| Pip | Smallest price increment (varies by symbol) |
| Spread | Difference between bid and ask |
| HLOC | High, Low, Open, Close (candle data) |
| OHLC | Same as HLOC, different order |

### 3.2 ICT / SMC / MSNR Concepts

| Term | Meaning | Source |
|------|---------|--------|
| ICT | Inner Circle Trader methodology | `packages/indicators/src/smc/` |
| SMC | Smart Money Concepts | `packages/indicators/src/smc/` |
| MSNR | Market Structure, Narrative, Risk (analysis framework) | Referenced in system prompt |
| FVG | Fair Value Gap (imbalance in price action) | `packages/indicators/src/smc/fvg.ts` |
| Order Block | Institutional order accumulation zone | `packages/indicators/src/smc/order-blocks.ts` |
| Liquidity | Areas where stop orders cluster | `packages/indicators/src/smc/liquidity.ts` |
| Asian Range | Price range during Asian trading session | `packages/indicators/src/smc/asian-range.ts` |
| PDH/PDL | Previous Day High / Previous Day Low | `packages/indicators/src/smc/pdh-pdl.ts` |
| Swings | Market structure swing points | `packages/indicators/src/smc/swings.ts` |
| Structure | Market structure (BOS, CHoCH) | `packages/indicators/src/smc/structure.ts` |

### 3.3 Prop-Firm Rules

| Firm | Key Rules |
|------|-----------|
| FTMO | Daily drawdown limit, max overall drawdown, profit target, consistency rule |
| FundedNext | Similar to FTMO with different thresholds |
| The5ers | Instant funding, no time limit, drawdown-based evaluation |

These are referenced in the AI system prompt and risk computation tools (`compute_risk`, `compute_position_health`).

### 3.4 TradingView / MT5

| Touchpoint | Source | Purpose |
|------------|--------|---------|
| TradingView Pro widget | `apps/web/src/components/chart/tradingview-widget.tsx` | Embedded charting |
| lightweight-charts v5 | `apps/web/src/components/chart/` | SMC overlay charts |
| MT5 Bridge | `tools/mt5/HamaBridge.mq5` | Streams ticks from MetaTrader 5 to worker via TCP |

---

## 4. Coding Conventions

### 4.1 Naming

| Pattern | Example |
|---------|---------|
| `kebab-case.ts` for modules | `get-candles.ts`, `memory-index.ts` |
| `PascalCase` for React components | `ChatScreen.tsx`, `NavDrawer.tsx` |
| `_prefix.ts` for private/internal | `_extensions.ts`, `_provision.sh` |
| `.test.ts` for test files | `candle-1m.test.ts` |
| `route.ts` for API route handlers | `api/chat/route.ts` |
| `page.tsx` for Next.js pages | `(app)/chat/page.tsx` |

### 4.2 TypeScript

- **Strict mode** — `tsconfig.base.json`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`
- No `any` without `eslint-disable` comment
- Zod at all package boundaries — input schemas, output schemas, env validation

### 4.3 Database

- Drizzle ORM with `pgTable()` definitions
- All user-data tables have `user_id` (text FK → `user.id`) and `tenant_id` (text) columns
- UUIDs via `gen_random_uuid()` (pgcrypto extension)
- Soft-delete via `deletedAt` timestamp column
- pgvector for embeddings (`vector(1536)` in Postgres, `real[]` in PGlite)

### 4.4 Error Handling

- `packages/shared/src/errors.ts` — standardized error codes
- API responses use envelope: `{ data: ... }` or `{ error: { code, message, details } }`
- `ProviderError` / `ProviderEmptyError` for data layer
- `BudgetExceededError` for AI cost guardrail

### 4.5 Context & State

- `AsyncLocalStorage` via `withToolContext()` / `withDiagnostics()` — no global state
- Each tool call has: threadId, env, signal, budget snapshot via `getToolContext()`
- `withTenantDb()` sets `app.current_tenant` GUC for RLS

### 4.6 Exports & Barrels

- Every package has `src/index.ts` barrel export
- Deep imports via `exports` field in `package.json` (e.g., `@hamafx/db/schema`, `@hamafx/db/client`)
- No circular dependencies — dependency chain is strictly layered

---

## 5. High-Risk Areas

### 5.1 Auth Code

- **Files:** `apps/web/src/auth.ts`, `apps/web/src/auth.config.ts`, `apps/web/src/middleware.ts`
- **Risk:** Session validation, JWT signing, CSRF, user isolation
- **Known bugs:** See [05-security-auth-compliance.md](./05-security-auth-compliance.md) §4 — token version not checked, `__system__` user in cron jobs, session validation gaps
- **Rule:** Do NOT regress to single-password gate. Multi-tenant is load-bearing. Read the security doc before touching auth.

### 5.2 BYOK Encryption

- **Files:** `packages/shared/src/encryption.ts`, `packages/ai/src/byok-providers.ts`
- **Risk:** User API keys encrypted at rest with AES-256-GCM. Decryption in memory only.
- **Rule:** Never log decrypted keys. Never commit `ENCRYPTION_SECRET`. Use `redactSecrets()` in all diagnostic output.

### 5.3 Live-Money Paths

- **Files:** `packages/ai/src/portfolio/`, `packages/ai/src/tools/compute-risk.ts`, `packages/ai/src/tools/compute-position-health.ts`
- **Risk:** Risk calculations affect trading decisions. Incorrect math can cause real financial harm.
- **Rule:** All risk computations must be tested. Never round or simplify risk math without explicit instruction.

### 5.4 RLS Policies

- **Files:** `packages/db/drizzle/0035_*` through `0039_*`, `packages/db/src/with-user-scope.ts`
- **Risk:** RLS policies enforce tenant isolation. Breaking them exposes all users' data.
- **Rule:** Never disable RLS policies. When adding new tables, add RLS policies and `tenant_id` columns.

### 5.5 Billing Webhook

- **File:** `apps/web/src/app/api/billing/webhook/route.ts`
- **Risk:** Handles real money. HMAC-SHA512 verification must run before any business logic.
- **Rule:** Never process a webhook without verifying the signature first. See safety gate requirements in [05-security-auth-compliance.md](./05-security-auth-compliance.md) §6.

---

## 6. The 32 AI Tools

All tools in `packages/ai/src/tools/`, registered in `index.ts`. Each flows through `withTelemetry()` for per-call DB telemetry.

| Tool | Source | Purpose |
|------|--------|---------|
| `get_price` | `get-price.ts` | Current bid/ask for a symbol |
| `get_candles` | `get-candles.ts` | Historical OHLC candles |
| `get_indicators` | `get-indicators.ts` | Technical indicators (RSI, MACD, ATR, Bollinger, etc.) |
| `get_market_structure` | `get-market-structure.ts` | SMC market structure (BOS, CHoCH, swings) |
| `get_news` | `get-news.ts` | Financial news with sentiment |
| `get_calendar` | `get-calendar.ts` | Economic calendar events |
| `set_alert` | `set-alert.ts` | Create price/indicator alert |
| `log_journal` | `log-journal.ts` | Create journal entry |
| `search_knowledge` | `search-knowledge.ts` | RAG search via pgvector embeddings |
| `analyze_technical` | `analyze-technical.ts` | Deep technical analysis |
| `analyze_fundamental` | `analyze-fundamental.ts` | Fundamental analysis (macro, news, events) |
| `get_journal_stats` | `get-journal-stats.ts` | Trading journal statistics |
| `annotate_chart` | `annotate-chart.ts` | Annotate chart with SMC levels |
| `analyze_chart_image` | `analyze-chart-image.ts` | Vision model chart image analysis |
| `get_correlation` | `get-correlation.ts` | Cross-asset correlation |
| `get_cot` | `get-cot.ts` | CFTC Commitment of Traders data |
| `share_snapshot` | `share-snapshot.ts` | Create shareable snapshot (HMAC-signed) |
| `compute_risk` | `compute-risk.ts` | Position risk calculation (R-multiple, position size) |
| `get_session_levels` | `get-session-levels.ts` | Trading session levels (Asian, London, NY) |
| `get_intermarket` | `get-intermarket.ts` | Intermarket analysis (DXY, yields, gold) |
| `forecast_volatility` | `forecast-volatility.ts` | Volatility forecast |
| `get_seasonality` | `get-seasonality.ts` | Seasonal patterns |
| `compute_position_health` | `compute-position-health.ts` | Position health check (drawdown, risk) |
| `replay_setup` | `replay-setup.ts` | Trade replay setup |
| `summarize_thread` | `summarize-thread.ts` | Summarize chat thread |
| `verify_call` | `verify-call.ts` | Verify a claimed price/event against data |
| `convene_committee` | `convene-committee.ts` | Multi-agent committee deliberation |
| `get_intermarket_resonance` | `get-intermarket-resonance.ts` | Intermarket resonance (real yield, DXY divergence) |
| `get_system_diagnostics` | `get-system-diagnostics.ts` | System health check (DB, worker, budget) |
| `run_system_action` | `run-system-action.ts` | Execute system action (e.g., clear cache) |
| `get_portfolio_snapshot` | `get-portfolio-snapshot.ts` | Portfolio snapshot (positions, balance, P&L) |
| `get_social_sentiment` | `get-social-sentiment.ts` | Social/retail sentiment data |

### Tool Pattern

Every tool follows this pattern:
1. Define `InputSchema` (Zod) in `packages/shared/src/schemas/tool-outputs/<name>.ts`
2. Implement `execute()` function in `packages/ai/src/tools/<name>.ts`
3. Register in `packages/ai/src/tools/index.ts` with `withTelemetry()`
4. Add UI part in `apps/web/src/components/chat/parts/<name>.tsx`
5. Register UI part in `apps/web/src/components/chat/parts/registry.tsx`

---

## 7. Multi-Agent Committee

`packages/ai/src/multi-agent/` — 5 domain agents that parallel-evaluate market conditions:

| Agent | Source | Domain |
|-------|--------|--------|
| `fundamental-agent.ts` | | Macro, news, economic events |
| `technical-agent.ts` | | Chart structure, indicators, SMC |
| `risk-agent.ts` | | Position risk, drawdown, prop-firm rules |
| `sentiment-agent.ts` | | News sentiment, social sentiment |
| `decision-agent.ts` | | Final decision fusion, grade assignment |

**Orchestrator:** `packages/ai/src/multi-agent/orchestrator.ts` — runs agents in parallel, collects opinions, fuses into consensus grade (A/B/C/D/F).

**Opinions persisted:** `agent_opinions` table (14 columns: agentName, bias, confidence, reasoning, model, costUsd, latencyMs, etc.)

**UI rendering:** `apps/web/src/components/chat/parts/agent-deliberation.tsx`

**Analysis modes** (`packages/ai/src/multi-agent/modes.ts`):
- `single` — no committee
- `quick` — 1-2 agents
- `standard` — 3 agents
- `full` — all 5 agents
- `auto` — agent decides based on query complexity

---

## 8. Model Routing

`packages/ai/src/routing.ts` — `routeTurn()` picks model based on turn domain:

| Domain | Model selection |
|--------|----------------|
| Fundamental | Fundamental-analysis-capable model |
| Technical | Technical-analysis-capable model |
| Summary | Cheaper/summary model |
| Vision | Vision-capable model (for chart image analysis) |

**Per-user overrides:** Users pick models in `/settings/models`. `resolveOverrideModel()` checks user preferences first, falls back to `AI_DEFAULT_MODEL` (default: `google/gemini-2.5-flash`).

**Fallback chain:** If primary model fails, next model in user's fallback chain is tried. Configured in `/settings/models`.

**Planner model:** `derivePlannerModel()` — uses `AI_TITLE_MODEL` (default: `google/gemini-2.5-flash-lite`) for the plan-then-act pre-step.

---

## 9. What NOT to Change

1. **Auth flow** — NextAuth v5 (Credentials provider) with strict per-user `userId` scoping. Multi-tenant is load-bearing. Do not regress to single-password gate.
2. **Middleware** — Edge runtime constraint is intentional. Don't add DB calls or Node.js imports to `middleware.ts`.
3. **Provider failover** — `runWithFailover()` pattern. Don't add direct provider calls bypassing the failover layer.
4. **Tool pattern** — `inputSchema → module augmentation → execute → withTelemetry`. Don't break the tool registry.
5. **AsyncLocalStorage** — tools use `getToolContext()`. Don't use global state.
6. **Zod at boundaries** — every data shape crossing package boundaries validates through `@hamafx/shared` schemas. Don't skip validation.
7. **PGlite compatibility** — new DB features must work without pgvector and without RLS (PGlite strips both).
8. **Budget guardrail** — `tryReserveBudget()` atomic guard. Don't bypass it.
9. **Citation enforcement** — `enforceCitations()` post-finish fact-check. Don't disable it.

---

## 10. Known Bugs & TODOs

### Known Bugs

| Bug | Severity | Source | Status |
|-----|----------|--------|--------|
| Token version not checked in JWT callback | Critical | `auth.ts` | Unfixed — `AUTH_FIX_PLAN.md` never created |
| `__system__` user in cron jobs | Critical | `api/cron/briefings/route.ts`, `api/cron/weekly-review/route.ts` | Unfixed |
| Session validation gaps (deleted users keep access) | High | `auth.config.ts` | Unfixed |
| AlphaVantage API key in env but no provider implementation | Low | `.env.example` | Stale reference |
| Trading Economics API key in env but no provider implementation | Low | `.env.example` | Stale reference |

### Half-Finished Migrations

| Migration | Status |
|-----------|--------|
| RLS cutover (0035–0039) | Applied but enforcement off by default (`HAMAFX_ENABLE_RLS` must be `true`) |
| Organization tables | Created but not actively used for data isolation |
| NOWPayments billing | Fully wired but in sandbox mode — production cutover prerequisites unchecked |

### TODOs

- `AUTH_FIX_PLAN.md` — referenced in old AGENTS.md, never created. Auth bugs need fixing.
- Data provider licensing — no terms files exist. Legal review needed before redistributing data to paying subscribers.
- Billing production cutover — safety gate requirements must be met before going live.
