# 09a — Phase 0 Deployed State (snapshot)

> Snapshot of what's actually live in production after the Phase 0 deploy.
> If you (or another AI agent) want to know "what's already configured?",
> read this. If you want the original plan, see `09-deployment.md`.

## Live URL

**Production**: https://hama-fx-ai.vercel.app

Aliases: `hama-fx-ai-mahamad-ahmads-projects.vercel.app`,
`hama-fx-ai-git-main-mahamad-ahmads-projects.vercel.app`.

## Vercel project

- Project ID: `prj_aGfvnSMdjGSrjBeDGVwYFNqeiwQ0`
- Team / org: `team_xtwkfAIEnnFQSw012zIRvO1x` (`mahamad-ahmads-projects`)
- GitHub link: `HamaFx/HamaFX-Ai` (repoId `1249819677`), production branch `main`
- Root Directory: `apps/web`
- Framework preset: `nextjs`
- Node version: 24.x
- SSO deployment protection: **disabled** (we have our own password gate)
- `vercel.json`: framework + per-route function timeouts. **No crons** —
  Hobby plan caps cron jobs at once-per-day; re-add the schedules block from
  the original plan after upgrading to Pro or accepting daily-only cadence.

## Environment variables (production + preview)

Configured ✅:

- `APP_PASSWORD` (sensitive)
- `AUTH_COOKIE_SECRET` (sensitive, 32-byte hex)
- `CRON_SECRET` (sensitive, 24-byte hex)
- All Supabase integration variables (auto-provisioned):
  `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`,
  `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`,
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Code-level: `packages/shared/src/env.ts` accepts either `DATABASE_URL` or
`POSTGRES_URL` so the Supabase Vercel integration drops in seamlessly.

Not yet set (per-phase) — see § "Pending integrations" below.

## Database (Supabase Postgres)

Provisioned via the Vercel × Supabase Marketplace integration.
Connection: pooler at `aws-1-us-east-1.pooler.supabase.com:6543` (transaction
mode, `prepare: false` enforced by the Drizzle client).

### Extensions installed

| Extension | Schema | Version |
| --- | --- | --- |
| `plpgsql` | `pg_catalog` | 1.0 |
| `pgcrypto` | `extensions` | 1.3 |
| `uuid-ossp` | `extensions` | 1.1 |
| `vector` | `extensions` | 0.8.0 |
| `pg_stat_statements` | `extensions` | 1.11 |
| `supabase_vault` | `vault` | 0.3.1 |

`vector` and `pgcrypto` are required by our schema; install via
`pnpm --filter @hamafx/db migrate:setup-extensions` before the first
`migrate:apply` (idempotent).

### Schema (migration `0000_lazy_red_shift.sql`, applied)

| Table | Purpose |
| --- | --- |
| `chat_threads`     | one row per conversation |
| `chat_messages`    | per-turn messages (parts as JSONB for tool UI) |
| `alerts`           | price / indicator / candle-close rules |
| `journal_entries`  | manual trade entries (no `user_id`, single user) |
| `news_articles`    | curated news, deduped by sha1(url) |
| `news_embeddings`  | pgvector(1536) — cosine HNSW index for RAG |
| `economic_events`  | macro calendar from TE + FRED |
| `snapshots`        | daily HLOC / pivots / ATR per symbol |
| `chat_telemetry`   | tokens + cost per chat turn (drives /settings/usage) |

17 indexes total, including the HNSW `news_embeddings_hnsw_idx` for vector
similarity search.

## Smoke tests (run at deploy time, all ✅)

```
GET /                      → 307 → /login
GET /chat                  → 307 → /login?next=/chat
GET /login                 → 200 (form renders)
POST /api/auth/login (bad) → 401 { code:"AUTH" }
GET  /api/cron/news (no auth) → 401 { code:"AUTH" }
```

## Pending integrations (you sign up, paste keys, ship)

These are **not configured yet**. None are needed for Phase 0; they unblock
Phase 1 features as listed.

| Integration | Phase | Where | Notes |
| --- | --- | --- | --- |
| **Vercel AI Gateway** | 1b (chat) | https://vercel.com/dashboard/ai-gateway | Generates `AI_GATEWAY_API_KEY`. One key, all providers. |
| **Upstash Redis** | 1a (price cache) | Vercel Marketplace → Upstash → Redis | Auto-creates `UPSTASH_REDIS_REST_URL` + `_TOKEN`. Free tier covers personal use. |
| **Twelve Data** | 1a (FX + XAU prices, candles) | https://twelvedata.com | `TWELVEDATA_API_KEY`. Free tier 800 reqs/day. |
| **Marketaux** | 1c (news) | https://marketaux.com | `MARKETAUX_API_KEY`. Free tier 100 reqs/day. |
| **Finnhub** | 1c (news fallback, FX fallback) | https://finnhub.io | `FINNHUB_API_KEY`. Free tier 60/min. |
| **Trading Economics** | 1c (calendar) | https://tradingeconomics.com/api | `TRADING_ECONOMICS_KEY`. Has limited free guest key. |
| **FRED** | 1c (macro series) | https://fred.stlouisfed.org/docs/api | `FRED_API_KEY`. Free, registration only. |
| **Alpha Vantage** | 1a (deep historicals) | https://www.alphavantage.co | Optional. `ALPHAVANTAGE_API_KEY`. Free 25/day. |
| **Resend** | 1d (alert email) | https://resend.com | Optional alternative to Telegram. `RESEND_API_KEY`. |
| **Telegram bot** | 2 (alert delivery) | https://t.me/BotFather | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`. |

After signing up for any of the above, set the env vars on Vercel
(**Settings → Environment Variables** for the project) — no redeploy needed,
Vercel rebuilds automatically when production env changes.

## Operational runbook

### Re-run database migrations

```bash
# 1. pull live env vars locally
pnpm dlx vercel env pull apps/web/.env.production --environment=production

# 2. load env + run migration
set -a; source apps/web/.env.production; set +a
pnpm --filter @hamafx/db migrate:setup-extensions   # only first time per DB
pnpm --filter @hamafx/db migrate:apply
```

### Trigger a deploy by hand

```bash
# Auto: just push to main (SSO protection is off, deploys are not blocked).

# Manual API trigger (bypass git):
curl -X POST "https://api.vercel.com/v13/deployments?teamId=$TEAM&forceNew=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"hama-fx-ai","project":"prj_aGfvnSMdjGSrjBeDGVwYFNqeiwQ0","target":"production","gitSource":{"type":"github","ref":"main","repoId":1249819677}}'
```

### Rollback

Use the Vercel dashboard → **Deployments** → pick a previous READY one →
**Promote to Production**. No DB rollback needed since migrations are
forward-only.
