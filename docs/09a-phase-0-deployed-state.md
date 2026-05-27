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
- ✅ **Phase 2** — SMC composite tools, RAG, annotations, snapshots, Telegram, voice, briefings, weekly review, auto-journal, Finnhub fallback, FRED backfill
- ✅ **Phase 3** — vision (`analyze_chart_image`), `get_correlation` + DXY proxy, `get_cot` + CFTC ingestion, `share_snapshot` + public `/share/[id]` route, TradingView Pro chart, web push as a 3rd alert channel

## Phase 2 additions (live in production)

| Surface           | Endpoint / module                                              | Notes                                                                                          |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| AI tool           | `search_knowledge`                                             | pgvector cosine over `news_embeddings`; one embed call per invocation.                         |
| AI tool           | `analyze_technical`                                            | Multi-timeframe trend / bias / momentum / structure / levels in one call.                      |
| AI tool           | `analyze_fundamental`                                          | Currency-scoped calendar + news + sentiment buckets.                                           |
| AI tool           | `get_journal_stats`                                            | Global stats + per-symbol + per-tag breakdowns.                                                |
| AI tool           | `annotate_chart`                                               | Emits the chart's `OverlaySet` directly; deep-links into `/chart/<symbol>?overlays=…`.         |
| Cron              | `/api/cron/snapshots` @ `5 0 * * *`                            | Daily HLOC + pivots + ATR + PDH/PDL + Asian range per symbol → `snapshots`.                    |
| Cron              | `/api/cron/briefings` @ `*/5 * * * *`                          | Pre-event (now+30m±2m) + post-event (now-30m±2m + actual) → `Briefings_Thread` (idempotent).   |
| Cron              | `/api/cron/weekly-review` @ `0 18 * * 0`                       | Sunday 18:00 UTC → 7-day journal review → `Briefings_Thread`.                                  |
| Cron              | `/api/cron/fred-actuals` @ `30 1 * * *`                        | Backfills `economic_events.actual` from FRED `/series/observations` for past null rows.        |
| Alerts            | Telegram delivery in `packages/ai/src/alerts/delivery.ts`      | Same Resend-style 2xx-then-`markFired` ordering; MarkdownV2 escaping helper.                   |
| Admin             | `POST /api/admin/test-telegram`                                | One-shot send for the configured bot+chat; mirrors `test-alert-email` (200/401/503/502).       |
| Settings UI       | `TestTelegramButton` in `_components/`                         | Same three-state result rendering (sent / missing-env / error) as the email tester.            |
| Chat composer     | `useVoiceInput` hook + 44×44 mic button in `composer.tsx`      | Web Speech API; SSR-safe support probe; recording dot pulses while active.                     |
| Chat surface      | Auto-Journal parser in `/api/chat`                             | Detects `Journal: …` shortcuts → `createEntry` server-side before delegating to the LLM.       |
| Data layer        | Finnhub candle fallback (`packages/data/src/providers/finnhub`)| `forex/candle` for 1m–1h native, 4h synthesised from 1H. Cache keys are provider-prefixed.     |

## Migrations applied

- `0000_lazy_red_shift.sql` — initial schema.
- `0001_phase_1_completion.sql` — `chat_threads.title_source`, `chat_telemetry.kind`.
- `0002_phase_2.sql` — `chat_threads.is_briefings`, `economic_events.actuals_filled_at`, `briefings_emitted` lookup.
- `0003_phase_3.sql` — `cot_reports`, `shared_snapshots`, `push_subscriptions`.

## Phase 3 additions (live in production)

| Surface           | Endpoint / module                                              | Notes                                                                                          |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| AI tool           | `analyze_chart_image`                                          | Vision tool. Reads the most recent user image part; structured output via `AI_VISION_MODEL`.   |
| AI tool           | `get_correlation`                                              | Pearson correlation matrix over the 3 symbols + 50/50 EUR/GBP geometric DXY proxy.             |
| AI tool           | `get_cot`                                                      | CFTC Commitment-of-Traders weekly samples; reads from `cot_reports` (cron populates).          |
| AI tool           | `share_snapshot`                                               | Persists `(title, body, overlay?)` and returns a signed `/share/[id]?t=<token>` URL.           |
| Cron              | `/api/cron/cot` @ `0 22 * * 5`                                 | Weekly CFTC ingestion via Socrata Disaggregated dataset; idempotent on `(symbol, report_date)`.|
| Public route      | `/share/[id]?t=<token>`                                        | HMAC-bypassed password gate; 401 on bad token, 410 on expired, 404 on missing.                 |
| Pro chart         | `/chart/[symbol]/pro`                                          | TradingView Advanced Charting Widget (gated by `NEXT_PUBLIC_TRADINGVIEW_ENABLED='1'`).         |
| Alerts            | Web Push delivery in `packages/ai/src/alerts/delivery.ts`      | RFC 8030 + VAPID, no `web-push` dep. 410/404 → drop subscription; 2xx → `markFired`.           |
| Push API          | `POST /api/push/subscribe` + `POST /api/push/unsubscribe`      | Both gated by middleware. Subscribe upserts on `endpoint`; unsubscribe is idempotent.          |
| Settings UI       | `EnableWebPushButton` in `_components/`                        | Probes browser support, calls `pushManager.subscribe`, posts to `/api/push/subscribe`.         |
| Service worker    | `push` + `notificationclick` listeners                         | Shows notification with `tag: 'hamafx-alert'`; click focuses or opens an existing tab.         |
| Chat composer     | Image-attach button + thumbnail strip in `composer.tsx`        | 4 images per turn cap, 5MB per image; forwards as AI SDK `file` parts to `/api/chat`.          |

## New env vars in Phase 3

| Variable                            | Required for                                  | Notes                                                                |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `AI_VISION_MODEL`                   | `analyze_chart_image`                         | Defaults to `google-vertex/gemini-2.5-pro`. Any vision-capable id.   |
| `VAPID_PUBLIC_KEY`                  | Web Push delivery                             | 65-byte uncompressed P-256 public key, base64url. Server + browser.  |
| `VAPID_PRIVATE_KEY`                 | Web Push delivery                             | Raw 32-byte P-256 `d`, base64url. Server-only. Never expose.         |
| `VAPID_SUBJECT`                     | Web Push delivery                             | Contact `mailto:` URL embedded in the VAPID JWT `sub` claim.         |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`      | `pushManager.subscribe` in the browser        | MUST equal `VAPID_PUBLIC_KEY` exactly.                               |
| `NEXT_PUBLIC_TRADINGVIEW_ENABLED`   | Pro chart toggle                              | `'1'` shows the link/route; anything else hides it.                  |

## New env vars in Phase 2

| Variable                              | Required for                                     | Notes                                                              |
| ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`                  | Telegram alert delivery + `/api/admin/test-telegram` | Set on Vercel project. Without it, the channel returns "not configured". |
| `TELEGRAM_CHAT_ID`                    | Telegram alert delivery                          | Personal chat id (numeric). Tester accepts a per-call override.    |

`FINNHUB_API_KEY` and `FRED_API_KEY` already exist from Phase 1; they unlock the new candle fallback and FRED backfill paths automatically.

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

| Extension            | Schema       | Version |
| -------------------- | ------------ | ------- |
| `plpgsql`            | `pg_catalog` | 1.0     |
| `pgcrypto`           | `extensions` | 1.3     |
| `uuid-ossp`          | `extensions` | 1.1     |
| `vector`             | `extensions` | 0.8.0   |
| `pg_stat_statements` | `extensions` | 1.11    |
| `supabase_vault`     | `vault`      | 0.3.1   |

`vector` and `pgcrypto` are required by our schema; install via
`pnpm --filter @hamafx/db migrate:setup-extensions` before the first
`migrate:apply` (idempotent).

### Schema (migration `0000_lazy_red_shift.sql`, applied)

| Table             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `chat_threads`    | one row per conversation                             |
| `chat_messages`   | per-turn messages (parts as JSONB for tool UI)       |
| `alerts`          | price / indicator / candle-close rules               |
| `journal_entries` | manual trade entries (no `user_id`, single user)     |
| `news_articles`   | curated news, deduped by sha1(url)                   |
| `news_embeddings` | pgvector(1536) — cosine HNSW index for RAG           |
| `economic_events` | macro calendar from TE + FRED                        |
| `snapshots`       | daily HLOC / pivots / ATR per symbol                 |
| `chat_telemetry`  | tokens + cost per chat turn (drives /settings/usage) |

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

| Integration           | Phase                 | Status                            | Notes                                                                                                                                                                 |
| --------------------- | --------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel AI Gateway** | 1b (chat)             | ✅ optional                       | `AI_GATEWAY_API_KEY`. Wins when set. Requires a card on file even for free credits.                                                                                  |
| **Google Gemini (direct)** | 1b (chat)        | ✅ optional                       | `GOOGLE_GENERATIVE_AI_API_KEY`. Personal-mode default. Free tier; pair with `AI_DEFAULT_MODEL=google/gemini-2.5-flash`.                                              |
| ~~Upstash Redis~~     | ~~1a~~                | n/a                               | **Skipped.** Phase 1a switched to Next.js Data Cache — free, persistent on Vercel, single-flight built-in. Env vars `UPSTASH_REDIS_REST_*` are accepted but optional. |
| **Twelve Data**       | 1a                    | ✅ wired & key set                | `TWELVEDATA_API_KEY`. Free tier 800 reqs/day.                                                                                                                         |
| **Marketaux**         | 1c                    | ✅ wired & key set                | `MARKETAUX_API_KEY`. Free tier 100 reqs/day.                                                                                                                          |
| **FRED**              | 1c                    | ✅ wired & key set                | `FRED_API_KEY`. Free, registration only.                                                                                                                              |
| **Finnhub**           | 1c (news fallback)    | ⚠️ optional                       | `FINNHUB_API_KEY`. Currently only the price-fallback path uses it; news fallback deferred to Phase 2.                                                                 |
| ~~Trading Economics~~ | ~~1c~~                | n/a                               | **Skipped.** FRED covers the calendar coverage we need; TE free guest tier is too thin to be useful.                                                                  |
| **Alpha Vantage**     | 1a (deep historicals) | ⚠️ optional                       | `ALPHAVANTAGE_API_KEY`. Not wired in code yet.                                                                                                                        |
| **Resend**            | 1d (alert email)      | ⚠️ **needed for alerts to email** | Set `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`. Without these, alerts evaluate + mark fired but no email goes out (logs a warning).                       |
| **Telegram bot**      | 2                     | not yet                           | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`. Alert delivery stub returns "deferred to Phase 2".                                                                         |

After signing up for any of the above, set the env vars on Vercel
(**Settings → Environment Variables** for the project) — no redeploy needed,
Vercel rebuilds automatically when production env changes.

## Cron triggering — GitHub Actions

We've chosen **GitHub Actions external scheduler** over Vercel Pro. Configuration lives in `.github/workflows/cron-{news,calendar,alerts,embedding-backfill}.yml`. Each workflow `curl`s the corresponding `/api/cron/*` endpoint with `Authorization: Bearer ${{ secrets.CRON_SECRET }}` against `secrets.PRODUCTION_URL`.

### Schedule

| Endpoint                       | Workflow                      | Cadence (UTC)  | Per-hour |
| ------------------------------ | ----------------------------- | -------------- | -------: |
| `/api/cron/news`               | `cron-news.yml`               | `*/5 * * * *`  |       12 |
| `/api/cron/calendar`           | `cron-calendar.yml`           | `*/15 * * * *` |        4 |
| `/api/cron/alerts`             | `cron-alerts.yml`             | `*/5 * * * *`  |       12 |
| `/api/cron/embedding-backfill` | `cron-embedding-backfill.yml` | `*/30 * * * *` |        2 |
| `/api/cron/snapshots`          | `cron-snapshots.yml`          | `5 0 * * *`    |   1/day  |
| `/api/cron/briefings`          | `cron-briefings.yml`          | `*/5 * * * *`  |       12 |
| `/api/cron/weekly-review`      | `cron-weekly-review.yml`      | `0 18 * * 0`   |  1/week  |
| `/api/cron/fred-actuals`       | `cron-fred-actuals.yml`       | `30 1 * * *`   |   1/day  |

GitHub Actions cron has 5-minute minimum granularity; sub-5-minute cadences are not possible without an external scheduler.

### Required repo secrets

Both secrets must be set on the GitHub repo (not the Vercel project) for the workflows to authenticate. Add them at **Settings → Secrets and variables → Actions → New repository secret** — direct link: <https://github.com/HamaFx/HamaFX-Ai/settings/secrets/actions>.

- `PRODUCTION_URL` — base URL the workflows curl against, e.g. `https://hama-fx-ai.vercel.app` (no trailing slash).
- `CRON_SECRET` — must match the value of the `CRON_SECRET` env var on the Vercel project. Rotate both at the same time if you ever change it.

Without both secrets present, every scheduled run will fail with a 401 from the cron endpoint (visible in the workflow run logs).

### Risks

- **Delay during peak load:** Schedule events can be deferred 10–20 min during peak GitHub load.
- **Pause after inactivity:** GitHub may pause scheduled workflows after ~60 days of repo inactivity. Mitigation: any push (even a docs commit) resets the timer.
- **No SLA:** Personal-tier scheduling is best-effort.

### Alerts cadence trade-off (decision: option a)

**Decision:** ≥ 12 alerts cron firings/hour (5-min cadence via GitHub Actions). Requirement 6 §7's original ≥ 30/hour target was relaxed because GitHub Actions cannot schedule sub-5-minute jobs. The alerts pipeline still fires every 5 minutes, which is acceptable for the personal-mode use case (no day-trading off these notifications). See "Deviations from requirements" below for the requirement-level note.

**Flip path (option b) if real-world latency feels bad:** add a free [cron-job.org](https://cron-job.org) trigger for `/api/cron/alerts` at 1-minute cadence with the same `Authorization: Bearer ${CRON_SECRET}` header. The endpoint is idempotent — alerts are marked fired only after Resend returns 2xx (see `packages/ai/src/alerts/delivery.ts` and Requirement 7 §5–§6) — so duplicate fires from GH Actions and cron-job.org are safe. If/when this is enabled, commit the cron-job.org job export to `.github/cron-job-org.json` (or a markdown record of the URL + headers configured).

### Where to find logs

- **Endpoint logs:** Vercel project → Functions → search by `/api/cron/<name>`.
- **Scheduler logs:** GitHub repo → Actions tab → pick a workflow run.
- **cron-job.org (if configured):** dashboard execution history.

### Manual trigger

Each workflow has `workflow_dispatch:` so you can run it on demand from the Actions tab without waiting for the scheduled time.

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

## PWA smoke checklist

Before declaring Phase 1 complete, verify the PWA manually:

1. Production build (`pnpm --filter @hamafx/web build && pnpm --filter @hamafx/web start`) registers `/sw.js` after first paint (DevTools → Application → Service Workers).
2. Toggle the browser to offline; reload `/chat` → cached `/chat` document renders with the offline banner visible.
3. Toggle back online → banner disappears within ≤ 1s.
4. "Add to Home Screen" works on Android Chrome (manifest icon appears, launches `/chat`).
5. "Add to Home Screen" works on iOS Safari (apple-touch-icon used, launches `/chat`, splash image briefly shown on iPhone 14 Pro).

## Lighthouse usage

Mobile audits live in `tools/lighthouse/run.mjs` (see `tools/lighthouse/README.md`). Reports land in `docs/lighthouse/<UTC-timestamp>/`.

```bash
# Local production build
pnpm --filter @hamafx/web build && pnpm --filter @hamafx/web start
node tools/lighthouse/run.mjs \
  --base-url http://localhost:3000 \
  --cookie "hfx_auth=<value>" \
  --out docs/lighthouse

# Deployed Vercel URL
node tools/lighthouse/run.mjs \
  --base-url https://hama-fx-ai.vercel.app \
  --cookie "hfx_auth=<value>" \
  --out docs/lighthouse
```

Thresholds: Performance ≥ 90, Accessibility ≥ 95. Failures listed in stdout; the run exits non-zero. Document waivers in `docs/lighthouse/waivers.md`.

## Eval harness usage

Local-only; runs the 10 acceptance prompts (`packages/ai/src/eval/prompts.json`) against a running app. Report markdown lands in `docs/eval/<UTC-timestamp>.md`.

```bash
# Against the local dev server
EVAL_COOKIE="hfx_auth=<value>" pnpm --filter @hamafx/ai eval --base-url http://localhost:3000

# Against the deployed app
pnpm --filter @hamafx/ai eval \
  --base-url https://hama-fx-ai.vercel.app \
  --cookie "hfx_auth=<value>" \
  --out docs/eval
```

No LLM-as-judge, no CI gate. Quality grading is manual.

## Deviations from requirements

Two deviations are accepted with rationale:

- **Requirement 6 §7 — alerts cron firing rate.** GitHub Actions cron has a 5-minute minimum granularity, so the alerts cron fires 12×/hour, not the 30 demanded by the requirement. We chose this trade-off over a Vercel Pro upgrade. Mitigation: optionally add a free [cron-job.org](https://cron-job.org) trigger pointed at `/api/cron/alerts` for sub-5-minute cadence.
- **Requirement 5 §10 — `/api/market/*` SW caching.** The optional stale-while-revalidate cache for `/api/market/*` is intentionally NOT implemented. Market data is timing-sensitive; serving 60-second-stale prices during network transitions is worse than serving none. The Next.js Data Cache layer in `packages/data/src/cache` is the canonical freshness boundary.
