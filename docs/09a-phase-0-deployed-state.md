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
  cron scheduling is handled by the GCE VM (see below).

## Cron VM (GCE)

- Instance: `hamafx-cron` in `us-central1-a`, project `hamafx-78845`
- Machine type: `e2-small` (2 vCPU, 2 GB RAM, ~$6/month)
- OS: Ubuntu 24.04 LTS Minimal
- Fires all `/api/cron/*` endpoints via system crontab + curl
- Docs: `infra/cron-vm/README.md`
- Logs: `/var/log/hamafx-cron.log` on the VM

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
| ~~Twelve Data~~       | ~~1a~~                | n/a                               | **Retired in Phase 8 PR-19.** BiQuote covers FX + XAU REST + SignalR for free without per-day caps. Env var `TWELVEDATA_API_KEY` is no longer read.                  |
| **BiQuote**           | 8 (primary FX + XAU)  | ✅ no key required                | `BIQUOTE_BASE_URL=https://biquote.io`, `BIQUOTE_HUB_URL=https://biquote.io/hubs/tick`. Free, unauthenticated. SignalR consumer on the worker writes `live_ticks`.    |
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

## Cron triggering — VM systemd timers (Phase 8)

> **History.** Phase 0–7 used `.github/workflows/cron-*.yml` as the external scheduler. Phase 1 also added a parallel system-`cron` daemon on the GCE VM. Phase 8 unified everything onto **systemd timers on the VM** and removed both the GitHub Actions workflows and the system `cron` daemon. The `.github/workflows/cron-*.yml` files were deleted in Phase 8 PR-21.

Cron scheduling is handled entirely by **`hamafx-cron`** (GCE `e2-medium`, `us-central1-a`, project `hamafx-78845`). Every job is a `hamafx-*.timer` + `hamafx-*.service` pair under systemd. Two flavours:

- **Heavy jobs** (`hamafx-job-*.service`) run in-process inside the always-on `hamafx-worker.service`. They don't hit Vercel; they talk to Postgres and the AI Gateway directly.
- **Light Vercel-poke crons** (`hamafx-light-*.service`) run a tiny `curl` against `https://hama-fx-ai.vercel.app/api/cron/<name>` with `Authorization: Bearer ${CRON_SECRET}` loaded from `/opt/hamafx/.env`.

Both flavours `curl` healthchecks.io after a successful run via `ExecStartPost=…hc-ping.com/${HC_*_UUID}` so a stale or missed run pages immediately.

### Schedule

| Endpoint / Job                 | systemd unit                                  | Cadence (UTC)  |
| ------------------------------ | --------------------------------------------- | -------------- |
| `/api/cron/news`               | `hamafx-light-news.timer`                     | `*/5 * * * *`  |
| `/api/cron/calendar`           | `hamafx-light-calendar.timer`                 | `*/15 * * * *` |
| `/api/cron/alerts`             | `hamafx-light-alerts.timer`                   | `*/5 * * * *`  |
| `/api/cron/warm-cache`         | `hamafx-light-warm-cache.timer`               | `*/2 * * * *`  |
| embedding-backfill             | `hamafx-job-embedding-backfill.timer`         | every 6h       |
| briefings                      | `hamafx-job-briefings.timer`                  | `*/5 * * * *`  |
| snapshots + 1m-candle prune    | `hamafx-job-snapshots.timer`                  | `5 0 * * *`    |
| cot                            | `hamafx-job-cot.timer`                        | `0 22 * * 5`   |
| fred-actuals                   | `hamafx-job-fred-actuals.timer`               | `30 1 * * *`   |
| weekly-review                  | `hamafx-job-weekly-review.timer`              | `0 18 * * 0`   |
| db backup                      | `hamafx-backup-db.timer`                      | `0 3 * * *`    |
| journal backup                 | `hamafx-backup-journal.timer`                 | `5 3 * * *`    |
| verify-restore                 | `hamafx-verify-restore.timer`                 | `0 4 * * 0`    |
| self-update                    | `hamafx-update.timer`                         | every 5 min    |

systemd timers have no minimum granularity — the previous 5-minute floor came from GitHub Actions and no longer applies. All cadences here can be tightened in `infra/cron-vm/units/hamafx-*.timer` without any platform constraint.

### Required env on the VM

The VM's `/opt/hamafx/.env` is the single source of truth. The Vercel project no longer needs `CRON_SECRET` to be a GitHub Actions secret — it just needs to match the value on the VM. See `infra/cron-vm/setup.sh` for the canonical list (`PRODUCTION_URL`, `CRON_SECRET`, `DATABASE_URL`, every `HC_*_UUID`, plus `BIQUOTE_BASE_URL` / `SENTRY_DSN` if overridden).

### Risks

- **Single VM is a SPOF.** Mitigated by `hamafx-update.timer` (5-min self-update from `origin/main`), nightly off-site GCS backups, and a weekly verify-restore. Worst case is a few hours of missed jobs while a fresh VM is rebuilt from `RECOVERY.md`.
- **No GitHub Actions cron fallback.** The legacy workflows were deleted in Phase 8 PR-21. If healthchecks.io reports a stale job, debug on the VM (`journalctl -u hamafx-<name>.service`).

**Flip path if cadence floors ever bite:** systemd `OnCalendar=` accepts arbitrary precision down to seconds, so tightening any cadence is one PR away. The endpoints stay idempotent (alerts mark themselves fired only after Resend returns 2xx — see `packages/ai/src/alerts/delivery.ts` and Requirement 7 §5–§6), so transient duplicate fires during a unit-file rollout are safe.

### Where to find logs

- **Endpoint logs:** Vercel project → Functions → search by `/api/cron/<name>`.
- **Scheduler logs:** SSH into `hamafx-cron` and `journalctl -u hamafx-<name>.service`. `systemctl list-timers --all 'hamafx-*'` shows every scheduled job and its next fire time.
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

- **Requirement 6 §7 — alerts cron firing rate.** Alerts now fire every 5 minutes via `hamafx-light-alerts.timer` on the VM, not the originally demanded 30/hour. The 5-minute floor came from GitHub Actions in Phase 0; Phase 8's systemd timers no longer constrain us, but the cadence is intentionally kept at 5 min to keep Vercel function invocations comfortably under the Hobby tier ceiling. Tightening to 1-min is a one-line change to `infra/cron-vm/units/hamafx-light-alerts.timer` if real-world latency ever feels bad.
- **Requirement 5 §10 — `/api/market/*` SW caching.** The optional stale-while-revalidate cache for `/api/market/*` is intentionally NOT implemented. Market data is timing-sensitive; serving 60-second-stale prices during network transitions is worse than serving none. The Next.js Data Cache layer in `packages/data/src/cache` is the canonical freshness boundary.
