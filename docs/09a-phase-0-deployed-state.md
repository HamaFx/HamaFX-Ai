# 09a — Deployed State (snapshot)

> Snapshot of what's actually live. If you (or another AI agent) want to
> know "what's already configured?", read this. The original deployment
> plan is in `09-deployment.md`; per-phase progress is in `10-roadmap.md`.

## Phase status

- ✅ **Phase 0** — scaffold + auth + DB
- ✅ **Phase 1a** — live data + chart (PR #4)
- ✅ **Phase 1b** — chat agent + 7 tools + persistence + budget guardrail (PR #5)
- ✅ **Phase 1c** — news + calendar ingestion + embeddings (PR #6)
- ✅ **Phase 1d** — alerts evaluator + email + journal CRUD (PR #7)
- ✅ **Phase 1e** — usage analytics + loading + error boundaries (PR #8)
- ⏳ **Phase 2** — SMC indicators, Telegram, briefings, RAG, composite tools

Pending real-world acceptance: re-run the 10 prompts from `00-overview.md`,
use it daily for a week.

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

### ⚠️ Pending integrations

These configure features that already have code wired up. Setting the env
var and redeploying is enough — no code changes needed.

| Integration | Phase | Status | Notes |
| --- | --- | --- | --- |
| **Vercel AI Gateway** | 1b (chat) | ✅ wired & key set | `AI_GATEWAY_API_KEY`. `/api/chat` streams via this. |
| ~~Upstash Redis~~ | ~~1a~~ | n/a | **Skipped.** Phase 1a switched to Next.js Data Cache — free, persistent on Vercel, single-flight built-in. Env vars `UPSTASH_REDIS_REST_*` are accepted but optional. |
| **Twelve Data** | 1a | ✅ wired & key set | `TWELVEDATA_API_KEY`. Free tier 800 reqs/day. |
| **Marketaux** | 1c | ✅ wired & key set | `MARKETAUX_API_KEY`. Free tier 100 reqs/day. |
| **FRED** | 1c | ✅ wired & key set | `FRED_API_KEY`. Free, registration only. |
| **Finnhub** | 1c (news fallback) | ⚠️ optional | `FINNHUB_API_KEY`. Currently only the price-fallback path uses it; news fallback deferred to Phase 2. |
| ~~Trading Economics~~ | ~~1c~~ | n/a | **Skipped.** FRED covers the calendar coverage we need; TE free guest tier is too thin to be useful. |
| **Alpha Vantage** | 1a (deep historicals) | ⚠️ optional | `ALPHAVANTAGE_API_KEY`. Not wired in code yet. |
| **Resend** | 1d (alert email) | ⚠️ **needed for alerts to email** | Set `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`. Without these, alerts evaluate + mark fired but no email goes out (logs a warning). |
| **Telegram bot** | 2 | not yet | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`. Alert delivery stub returns "deferred to Phase 2". |

After signing up for any of the above, set the env vars on Vercel
(**Settings → Environment Variables** for the project) — no redeploy needed,
Vercel rebuilds automatically when production env changes.

## Cron triggering (Hobby plan caveat)

Vercel **Hobby** caps cron jobs at once-per-day. We don't have a `crons`
block in `vercel.json`, so **none of the cron endpoints fire automatically**.
The endpoints themselves work — they're just waiting for a trigger.

Three options to fire on a useful cadence:

1. **Pro upgrade** — re-add the `crons:` block to `vercel.json` per the
   original `09-deployment.md` schedule.
2. **External scheduler** — Fly.io tiny worker, GitHub Actions cron, or
   [cron-job.org](https://cron-job.org) hitting:
     ```
     POST https://hama-fx-ai.vercel.app/api/cron/news
     POST https://hama-fx-ai.vercel.app/api/cron/calendar
     POST https://hama-fx-ai.vercel.app/api/cron/embedding-backfill
     POST https://hama-fx-ai.vercel.app/api/cron/alerts
     ```
   each with `Authorization: Bearer ${CRON_SECRET}`.
3. **Manual** — visit the empty-state UIs in `/news` / `/calendar` / `/alerts`
   and copy the curl recipe shown there.

Suggested cadences (when configured):

| Endpoint | Cadence |
| --- | --- |
| `/api/cron/news` | every 5 min |
| `/api/cron/embedding-backfill` | every 30 min |
| `/api/cron/calendar` | every 15 min |
| `/api/cron/alerts` | every 1–2 min |
| `/api/cron/snapshots` | daily at 23:55 UTC (Phase 2 only) |

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
