# 10 — Roadmap

> Personal-mode roadmap. Phases scoped by **value to you**. Each phase ends with a working, deployed product.

```mermaid
gantt
    title HamaFX-Ai Roadmap (indicative)
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d
    section Phase 0
    Scaffold + infra              :p0, 2026-06-01, 5d
    section Phase 1 (MVP)
    Live data + chart             :p1a, after p0, 5d
    Chat + tools                  :p1b, after p0, 8d
    News + calendar               :p1c, after p1a, 4d
    Alerts + journal (basic)      :p1d, after p1b, 4d
    Polish + ship                 :p1e, after p1d, 3d
    section Phase 2 (v1)
    SMC indicators + RAG          :p2a, after p1e, 8d
    Telegram alerts + voice       :p2b, after p2a, 5d
    Briefings + weekly review     :p2c, after p2b, 4d
    section Phase 3 (v2)
    Vision (chart screenshots)    :p3a, after p2c, 8d
    Pro chart widget + extras     :p3b, after p3a, 5d
```

---

## Phase 0 — Scaffold ✅ DONE

**Goal**: empty-but-real project deploys to Vercel, password gate works, design system renders.

- [x] pnpm + Turborepo monorepo per `03-project-structure.md`
- [x] `packages/config` (eslint, prettier, tsconfig, tailwind preset)
- [x] `packages/shared` skeletons (zod schemas)
- [x] `apps/web` Next.js 15 + Tailwind v4 + shadcn init + theme tokens
- [x] Supabase project + Drizzle initial migration (no Auth, no RLS)
- [ ] ~~Upstash Redis (cache only)~~ — **skipped**, replaced by Next.js Data Cache (free, persistent on Vercel). See `docs/06-data-sources.md` § Cache.
- [x] Vercel project + minimal CI (`lint typecheck test`)
- [x] `/api/auth/login` + `/login` page + middleware cookie gate
- [x] `.env.example` complete and documented

**Exit criteria** ✅: visiting any URL on the deploy redirects to `/login`; entering `APP_PASSWORD` lets you in; the app shell renders on mobile.

---

## Phase 1 — MVP ✅ DONE

**Goal**: a focused chat-driven assistant with charts, indicators, news, calendar, alerts, journal — for XAUUSD/EURUSD/GBPUSD only.

### Phase 1a — Live data & chart ✅

- [x] Twelve Data REST adapter (price + candles)
- [x] Finnhub fallback adapter (price only; candles deferred to Phase 2)
- [x] Polling hook (`use-prices`, `use-candles`) via TanStack Query
- [x] `lightweight-charts` wrapper + multi-timeframe URL state
- [x] Indicator engine MVP (EMA, SMA, RSI, MACD, ATR, Bollinger, pivots)
- [x] `/api/market/*` routes with Next.js Data Cache (was: Upstash)
- [x] Mobile shell with bottom nav

### Phase 1b — Chat & tools ✅

- [x] Chat thread schema + persistence
- [x] Vercel AI SDK v5 wired with Gateway
- [x] Tools shipped: `get_price`, `get_candles`, `get_indicators`, `get_news`, `get_calendar`, `set_alert`, `log_journal`
- [ ] Tools deferred to Phase 2: `analyze_technical`, `analyze_fundamental`, `search_knowledge`, `annotate_chart`, `get_journal_stats`
- [x] Generic ToolCard renderer (per-tool bespoke renderers deferred)
- [ ] Auto-titled threads — deferred (cosmetic)
- [x] `chat_telemetry` recording (tokens, model, ms, est-cost)
- [ ] Manual run of the **10 acceptance prompts** from `00-overview.md` — pending live walkthrough

### Phase 1c — News & calendar ✅

- [x] Marketaux primary news adapter (Finnhub news fallback deferred to Phase 2)
- [x] FRED calendar adapter (Trading Economics intentionally skipped — FRED covers what we need)
- [x] Cron endpoints `/api/cron/news`, `/api/cron/calendar`, `/api/cron/embedding-backfill` (auto-schedule deferred — Hobby plan caps daily, see "Cron triggering" below)
- [x] News page + Calendar page (server-rendered, with empty-state curl recipes)
- [x] Sentiment chips (Marketaux per-entity scores aggregated to article-level)
- [ ] News RAG via `search_knowledge` tool — deferred to Phase 2 (embeddings table is populated; the tool that queries it isn't implemented yet)

### Phase 1d — Alerts & journal (basic) ✅

- [x] Alert rule schema (price-cross, indicator-cross, candle-close)
- [x] Cron endpoint `/api/cron/alerts` (eval + email + markFired)
- [x] Email delivery via Resend (Telegram + web-push deferred to Phase 2 / 3)
- [x] Journal CRUD UI + win-rate / R-multiple stats
- [x] AI tools `set_alert` and `log_journal`

### Phase 1e — Polish + ship ✅

- [x] `/settings/usage` page (token spend, daily-budget gauge, per-model breakdown, last 7d chart)
- [x] Loading skeletons for `/news`, `/calendar`, `/chart/[symbol]`, `/settings/usage`
- [x] Root + per-segment error boundaries with retry
- [x] 404 page
- [x] Empty / error / stale states reviewed across all pages
- [ ] PWA install + offline shell — deferred (manifest works; service worker not added — risk vs. reward not worth it)
- [ ] Mobile Lighthouse perf ≥ 90, a11y ≥ 95 — needs measurement
- [ ] Re-run the 10 acceptance prompts — pending live walkthrough
- [ ] You start using it daily — pending

**Exit criteria**: app is feature-complete. Real-world acceptance still owed.

---

## Cron triggering (Phase 1 → Phase 2 deployment note)

Vercel **Hobby** caps cron jobs at once-per-day. We don't have a `crons` block in `vercel.json`. Cron scheduling is handled by a dedicated **GCE VM** (`hamafx-cron`, `e2-small` in `us-central1-a`, project `hamafx-78845`):

- The VM runs system crontab entries that `curl` each `/api/cron/*` endpoint with `Authorization: Bearer ${CRON_SECRET}`.
- High-frequency endpoints (news, alerts, briefings) fire every 5 minutes.
- Setup, schedule, and monitoring docs: `infra/cron-vm/README.md`.
- Monthly cost: ~$6 (or $0 if downgraded to `e2-micro` which is in the Always Free tier).

The GitHub Actions workflow files (`.github/workflows/cron-*.yml`) are kept as a secondary fallback but are not the primary scheduler.

---

## Phase 2 — v1 (≈ 2–3 weeks) ✅ DONE

**Goal**: depth where it matters — smart-money structure, RAG-grounded answers, voice, briefings.

- [x] SMC / ICT structure module: swings, BOS/CHoCH, order blocks, FVG, liquidity sweeps
- [x] Chart annotation overlays for the above (`annotate_chart` AI tool)
- [x] **Telegram bot** for alerts (faster than email, easier than web push)
- [x] Voice input (Web Speech API)
- [x] Pre-event and post-event briefings (cron + LLM, persisted as messages in a "briefings" thread)
- [x] Auto-fill journal from chat ("Journal: I shorted…")
- [x] Weekly review (LLM-authored from journal stats; runs Sunday)
- [x] Composite tools: `analyze_technical`, `analyze_fundamental`
- [x] RAG tool: `search_knowledge` (cosine similarity over `news_embeddings`)
- [x] Journal stats tool: `get_journal_stats`
- [x] Snapshots cron: precomputed daily HLOC / pivots / ATR per symbol
- [x] Finnhub candle fallback (synth 4h from 1h)
- [x] Backfill FRED actuals via `/fred/series/observations`

---

## Phase 3 — v2 (≈ 2 weeks) ✅ DONE

**Goal**: multimodal + breadth.

- [x] Vision: drop a chart screenshot, get analysis (`analyze_chart_image` tool)
- [x] Cross-pair correlation + DXY proxy module (`get_correlation` tool)
- [x] Optional **TradingView Advanced Charting Widget** view at `/chart/[symbol]/pro` (gated by `NEXT_PUBLIC_TRADINGVIEW_ENABLED`)
- [x] CoT (CFTC) report ingestion (weekly cron at `0 22 * * 5` UTC)
- [x] Sharable analysis snapshots — private signed link at `/share/[id]?t=<token>` (HMAC-bypassed password gate)
- [x] Web Push as a 3rd alert channel (RFC 8030 + VAPID, no `web-push` dep)

---

## Stretch / parking lot

- Add a separate **worker** on Fly.io if/when sub-second WS becomes worth it.
- Backtest narration tool (no full lab UI — just describe a rule, get historical performance).
- Add USDJPY / AUDUSD / USDCAD if you actively trade them (still keep total ≤ 6 instruments).
- Native mobile (Expo) reusing UI hooks.

## Definition of "done" per phase

| Phase | Done when…                                                                            |
| ----- | ------------------------------------------------------------------------------------- |
| 0     | ✅ You can log into the deploy and see a styled empty shell.                          |
| 1     | ✅ Feature-complete. Real-world acceptance still owed (re-run 10 prompts; daily use). |
| 2     | ✅ Stopped using your old workflow because this is enough.                            |
| 3     | ✅ Drop chart screenshots and get useful analysis without typing.                     |
