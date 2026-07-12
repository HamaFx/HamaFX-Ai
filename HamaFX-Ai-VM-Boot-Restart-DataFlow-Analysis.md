# HamaFX-Ai — VM Boot/Restart & Full Data-Flow Analysis

> **Scope:** VM shutdown, boot, restart paths + every cron job, worker service, data connection, and flow between VM ↔ DB ↔ Vercel ↔ external providers.
> **Base:** commit `3855e93` (post-implementation of all findings from the first analysis)
> **Date:** 2026-07-12

---

## Table of Contents

1. [VM Boot / Shutdown / Restart Analysis](#1-vm-boot--shutdown--restart-analysis)
2. [Every Connection & Flow Map](#2-every-connection--flow-map)
3. [Worker Service Deep Analysis](#3-worker-service-deep-analysis)
4. [Every Cron Job & Systemd Timer Analysis](#4-every-cron-job--systemd-timer-analysis)
5. [Data Flow: Worker → DB → Frontend](#5-data-flow-worker--db--frontend)
6. [Issues Found](#6-issues-found)
7. [Implementation Plan for Fixes](#7-implementation-plan-for-fixes)

---

## 1. VM Boot / Shutdown / Restart Analysis

### 1.1 VM Cold Boot (from stopped/terminated state)

**What happens when the GCE VM starts up:**

```
systemd init (PID 1)
  │
  ├── multi-user.target reached
  │     └── hamafx-worker.service starts (WantedBy=multi-user.target)
  │           ├── Type=notify → systemd waits for READY=1
  │           ├── EnvironmentFile=/opt/hamafx/.env loaded
  │           ├── HAMAFX_RUNTIME=worker, NODE_ENV=production set
  │           ├── node dist/index.js starts
  │           │     ├── loadSecretsFromVault() (GCP Secret Manager, no-op if unset)
  │           │     ├── loadEnv() → zod validates all env vars
  │           │     ├── createLogger() → JSON logger to stdout→journald
  │           │     ├── initSentry() → no-op if SENTRY_DSN unset
  │           │     ├── initLangfuse() → no-op if LANGFUSE_* unset
  │           │     ├── WORKER_MODE check
  │           │     │     └── 'systemd' (default) → NO internal scheduler started
  │           │     │     └── 'docker' → startScheduler() with node-cron
  │           │     ├── installSignalHandlers() → SIGTERM/SIGINT handlers
  │           │     ├── runWorker()
  │           │     │     ├── new TickBuffer()
  │           │     │     ├── getDb() → lazy postgres-js pool (max=3, 30s stmt timeout)
  │           │     │     ├── new Candle1mAggregator()
  │           │     │     ├── new SignalRConsumer() → connects to BiQuote SignalR
  │           │     │     ├── new BinanceStreamConsumer() → connects to Binance WS
  │           │     │     ├── new TwelveDataWsConsumer() → connects to TwelveData WS
  │           │     │     ├── startMT5Server() → TCP server on 127.0.0.1:8080
  │           │     │     ├── new SymbolManager() → polls DB for user_symbols every 60s
  │           │     │     ├── await consumer.start() → SignalR connection + subscribe
  │           │     │     ├── await binanceConsumer.start() → Binance WS connection
  │           │     │     ├── await tdConsumer.start() → TwelveData WS (if API key)
  │           │     │     ├── symbolManager.start() → initial DB poll + 60s interval
  │           │     │     ├── notifyReady() → systemd marks unit active (running)
  │           │     │     ├── setInterval(flushLiveTicks, 1000) → 1Hz DB UPSERT
  │           │     │     └── setInterval(heartbeat, 30000) → 30s healthchecks.io ping
  │           │     ├── healthServer.listen(8081, '127.0.0.1') → health + BiQuote proxy
  │           │     └── onShutdown registrations (healthServer, worker.stop, Sentry, Langfuse)
  │           │
  │           ├── TimeoutStartSec=60 → systemd waits up to 60s for READY=1
  │           ├── If timeout → kill + Restart=always (RestartSec=5)
  │           └── If ready → WatchdogSec=120 starts (worker must ping WATCHDOG=1 every ≤120s)
  │
  ├── timers.target reached
  │     ├── All hamafx-*.timer units activate
  │     ├── Persistent=true timers: catch up on missed runs during downtime
  │     │     ├── snapshots (daily 00:05) → runs if missed
  │     │     ├── cot (Fri 22:00) → runs if missed
  │     │     ├── fred-actuals (daily 01:30) → runs if missed
  │     │     ├── weekly-review (Sun 18:00) → runs if missed
  │     │     ├── resonance-sync (daily 23:00) → runs if missed
  │     │     ├── embedding-backfill (every 6h) → runs if missed
  │     │     ├── backup-db (daily 03:00) → runs if missed
  │     │     ├── backup-journal (daily 03:05) → runs if missed
  │     │     ├── verify-restore (Sun 04:00) → runs if missed
  │     │     ├── cleanup-uploads (daily 03:00) → runs if missed
  │     │     ├── tenant-export (Sun 05:00) → runs if missed
  │     │     ├── tenant-delete (Sun 05:30) → runs if missed
  │     │     ├── disk-check (hourly) → runs if missed
  │     │     └── docker-prune (Sun 05:00) → runs if missed
  │     ├── Persistent=false timers: skip missed runs, wait for next schedule
  │     │     ├── briefings (every 5 min) → skips, resumes on next 5-min mark
  │     │     ├── alerts (every 5 min) → skips, resumes on next 5-min mark
  │     │     ├── news (every 5 min) → skips, resumes on next 5-min mark
  │     │     ├── calendar (every 15 min) → skips, resumes on next 15-min mark
  │     │     └── warm-cache (every 2 min) → skips, resumes on next 2-min mark
  │     └── hamafx-update.timer: OnBootSec=2min → first self-update 2 min after boot
  │
  └── Network ready
        └── All services can reach Supabase, BiQuote, Binance, TwelveData, GCS, healthchecks.io
```

**Verdict: ✅ Boot is fully automated.** The worker starts on boot via `WantedBy=multi-user.target`. All timers activate via `WantedBy=timers.target`. Persistent timers catch up on missed runs. The self-update timer fires 2 minutes after boot to pull latest code. No manual intervention needed.

### 1.2 VM Graceful Shutdown (systemctl stop / reboot / GCE stop)

```
systemd sends SIGTERM to hamafx-worker.service
  │
  ├── installSignalHandlers() catches SIGTERM
  │     ├── state.shuttingDown = true
  │     ├── Runs cleanups in REVERSE registration order:
  │     │     1. shutdownLangfuse() → flushes Langfuse events
  │     │     2. flushSentry(2_000) → flushes Sentry events (2s timeout)
  │     │     3. worker.stop()
  │     │        ├── notifyStopping() → tells systemd we're shutting down
  │     │        ├── clearInterval(flushTimer) → stops 1Hz DB writes
  │     │        ├── clearInterval(heartbeatTimer) → stops HC pings
  │     │        ├── symbolManager.stop() → clears 60s poll timer
  │     │        ├── Promise.all([
  │     │        │     mt5Server.stop(),    → closes TCP server
  │     │        │     consumer.stop(),     → unsubscribes + stops SignalR
  │     │        │     binanceConsumer.stop(), → closes Binance WS
  │     │        │     tdConsumer.stop(),   → closes TwelveData WS
  │     │        │   ])
  │     │        ├── flushLiveTicks() → final buffer drain to DB (best-effort)
  │     │        └── aggregator.closeAll() → emits partial candles
  │     │     4. healthServer.close() → closes HTTP server on 8081
  │     └── process.exit(0)
  │
  ├── TimeoutStopSec=30 → systemd waits up to 30s, then SIGKILL
  │
  └── Timers: systemd stops all timer units (no special cleanup needed)
```

**Verdict: ✅ Shutdown is graceful.** The worker drains its tick buffer, closes all WebSocket connections, flushes observability tools, and exits cleanly within the 30-second timeout. Partial 1m candles are emitted so no data is lost at bar boundaries.

### 1.3 VM Crash / Kill (SIGKILL / OOM / kernel panic)

```
systemd detects worker exit (non-zero or signal)
  │
  ├── Restart=always → restarts after RestartSec=5
  ├── StartLimitIntervalSec=300, StartLimitBurst=10
  │     └── After 10 restarts in 5 minutes → stops retrying (prevents crash loop)
  ├── In-memory state lost:
  │     ├── TickBuffer contents (latest ticks per symbol) → LOST
  │     ├── Open 1m candle bars → LOST (partial bar data)
  │     └── SymbolManager state → re-fetched from DB on restart
  ├── Persistent state survives:
  │     ├── live_ticks table in Postgres → persists (last known tick)
  │     ├── candles_1m table → persists (all closed bars)
  │     └── cron_runs table → persists (idempotency locks)
  └── On restart:
        ├── SignalR reconnects and resubscribes
        ├── Binance WS reconnects
        ├── TwelveData WS reconnects (if API key)
        ├── SymbolManager re-polls DB
        └── notifyReady() → systemd marks active
```

**Verdict: ✅ Crash recovery is automatic.** systemd restarts the worker within 5 seconds. The `StartLimitBurst=10` prevents infinite crash loops. Data loss is limited to in-flight ticks (at most 1 second of tick data, since the flush loop runs at 1Hz) and the current open 1m candle bar (at most 59 seconds of tick data).

### 1.4 Self-Update Restart (update.sh)

```
hamafx-update.timer fires (every 5 min, OnBootSec=2min for first run)
  │
  ├── update.sh runs as hamafx user
  │     ├── flock guard (prevents concurrent runs)
  │     ├── git fetch origin main
  │     ├── If HEAD == origin/main → exit (no-op)
  │     ├── git reset --hard origin/main
  │     ├── pnpm install --frozen-lockfile
  │     ├── pnpm --filter @hamafx/worker build
  │     ├── (tests SKIPPED — CI handles testing)
  │     ├── Update DEPLOYED_SHA in /opt/hamafx/.env
  │     ├── sudo systemctl restart hamafx-worker.service
  │     │     └── Triggers graceful shutdown (§1.2) then boot (§1.1)
  │     ├── Post-deploy health check (30s wait):
  │     │     ├── Check systemctl is-active → must be 'active'
  │     │     └── Check NRestarts > 1 → crash loop → rollback
  │     ├── If health check fails → rollback to PREV_SHA
  │     │     ├── git reset --hard PREV_SHA
  │     │     ├── pnpm install + build
  │     │     ├── sudo systemctl restart hamafx-worker.service
  │     │     └── ping_hc fail "rolled back"
  │     └── pnpm store prune
  │
  └── Worker restarts on new code with zero manual intervention
```

**Verdict: ✅ Self-update is fully automated with automatic rollback.** The 30-second post-deploy health check catches runtime crashes that only surface after the first tick. Rollback is robust — each step fails loudly with a healthcheck ping if it breaks.

---

## 2. Every Connection & Flow Map

### 2.1 Complete Connection Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GCE VM (hamafx-cron)                             │
│                        e2-medium, us-central1-a                         │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ hamafx-worker.service (always-on, Type=notify)                   │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐            │  │
│  │  │ SignalR     │  │ Binance WS   │  │ TwelveData WS│            │  │
│  │  │ Consumer    │  │ Consumer     │  │ Consumer     │            │  │
│  │  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘            │  │
│  │         │                │                  │                    │  │
│  │         ▼                ▼                  ▼                    │  │
│  │  ┌─────────────────────────────────────────────────────┐        │  │
│  │  │ handleIncomingTick() — priority: MT5 > TD > BiQuote  │        │  │
│  │  │   → TickBuffer.push()                                │        │  │
│  │  │   → Candle1mAggregator.feed()                        │        │  │
│  │  │   → notifyWatchdog() (sd_notify WATCHDOG=1)          │        │  │
│  │  └─────────────────────────────────────────────────────┘        │  │
│  │                                                                   │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐          │  │
│  │  │ MT5 TCP      │  │ SymbolManager │  │ HealthServer │          │  │
│  │  │ Server       │  │ (60s DB poll) │  │ 127.0.0.1:   │          │  │
│  │  │ 127.0.0.1:   │  │               │  │   8081       │          │  │
│  │  │   8080       │  └───────┬───────┘  └──────────────┘          │  │
│  │  └──────────────┘          │                                    │  │
│  └────────────────────────────┼────────────────────────────────────┘  │
│                               │                                       │
│  ┌────────────────────────────▼────────────────────────────────────┐  │
│  │ 1Hz flush loop                                                   │  │
│  │   flushLiveTicks() → UPSERT live_ticks (symbol PK)               │  │
│  │   flushClosedCandle() → INSERT candles_1m (ON CONFLICT DO NOTHING)│  │
│  └────────────────────────────┬────────────────────────────────────┘  │
│                               │                                       │
│  ┌────────────────────────────▼────────────────────────────────────┐  │
│  │ 30s heartbeat → healthchecks.io (HC_SIGNALR_UUID)                │  │
│  │   success if tick in last 60s, fail otherwise                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ systemd timers (20 timers)                                        │  │
│  │                                                                   │  │
│  │ Light crons (curl → Vercel):                                      │  │
│  │   news (5m) → POST /api/cron/news                                 │  │
│  │   calendar (15m) → POST /api/cron/calendar                        │  │
│  │   alerts (5m) → POST /api/cron/alerts                             │  │
│  │   warm-cache (2m) → POST /api/cron/warm-cache                     │  │
│  │   cleanup-uploads (daily 03:00) → POST /api/cron/cleanup-uploads  │  │
│  │                                                                   │  │
│  │ Heavy jobs (node dist/runner/cli.js):                             │  │
│  │   briefings (5m) → emitPreEvent/emitPostEvent → briefings_emitted │  │
│  │   snapshots (daily 00:05) → upsertSnapshot + prune candles_1m     │  │
│  │   cot (Fri 22:00) → upsertCoTReport → cot_reports                 │  │
│  │   fred-actuals (daily 01:30) → patchEventActual → economic_events │  │
│  │   weekly-review (Sun 18:00) → emitWeeklyReview → journal_entries   │  │
│  │   resonance-sync (daily 23:00) → intermarket_resonance            │  │
│  │   embedding-backfill (6h) → backfillEmbeddings → memory_embeddings │  │
│  │                                                                   │  │
│  │ Infrastructure:                                                   │  │
│  │   update (5m) → git pull + build + restart worker                 │  │
│  │   backup-db (daily 03:00) → pg_dump | gzip | gsutil → GCS         │  │
│  │   backup-journal (daily 03:05) → psql JSON | gsutil → GCS         │  │
│  │   verify-restore (Sun 04:00) → pg_restore in Docker container     │  │
│  │   tenant-export (Sun 05:00) → JSON export → GCS                   │  │
│  │   tenant-delete (Sun 05:30) → dry-run delete rehearsal            │  │
│  │   disk-check (hourly) → df check + HC ping                        │  │
│  │   docker-prune (Sun 05:00) → docker image prune                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│ Supabase        │  │ Vercel       │  │ External Services    │
│ (Postgres 16 +  │  │ (apps/web)   │  │                      │
│  pgvector)      │  │              │  │ BiQuote (SignalR)    │
│                 │  │ /api/market/ │  │ Binance (WS)         │
│ Tables:         │  │   price      │  │ TwelveData (WS)      │
│  live_ticks     │  │   candles    │  │ FRED API             │
│  candles_1m     │  │   indicators │  │ CFTC API             │
│  snapshots      │  │   structure  │  │ Marketaux API        │
│  cot_reports    │  │   stream     │  │ Finnhub API          │
│  economic_events│  │              │  │ GCS (backups)        │
│  intermarket_   │  │ Reads from:  │  │ healthchecks.io      │
│    resonance    │  │  live_ticks  │  │ Sentry               │
│  briefings_     │  │  candles_1m  │  │ Langfuse             │
│    emitted      │  │  snapshots   │  │                      │
│  journal_entries│  │  cot_reports │  │                      │
│  memory_        │  │  economic_   │  │                      │
│    embeddings   │  │    events    │  │                      │
│  cron_runs      │  │  intermarket_│  │                      │
│  user_symbols   │  │    resonance │  │                      │
│  user_settings  │  │  journal_    │  │                      │
│  ...            │  │    entries   │  │                      │
└─────────────────┘  └──────────────┘  └──────────────────────┘
```

### 2.2 Connection Inventory

| # | From | To | Protocol | Purpose | Auto-Reconnect? |
|---|------|----|---------|---------|----------------|
| 1 | Worker | Supabase Postgres | TCP/TLS (postgres-js) | All DB reads/writes | Pool auto-reconnects (max_lifetime=30min) |
| 2 | Worker | BiQuote SignalR | HTTPS + WebSocket | Live forex/gold ticks | Yes: automatic reconnect (0,2,5,10,30s) + manual rebuild with exponential backoff (max 60s) |
| 3 | Worker | Binance WS | WSS | Live crypto klines | Yes: reconnect delays (1,2,5,10,30s) + idle timeout (10min) |
| 4 | Worker | TwelveData WS | WSS | Live gold/forex ticks (8 slots) | Yes: reconnect delays (1,2,5,10,30s) + server-requested reconnect |
| 5 | Worker | healthchecks.io | HTTPS | 30s heartbeat (HC_SIGNALR_UUID) | Fire-and-forget, no persistent connection |
| 6 | Worker | Sentry | HTTPS | Error capture | Lazy init, flush on shutdown |
| 7 | Worker | Langfuse | HTTPS | LLM observability | Lazy init, flush on shutdown |
| 8 | Worker | MT5 Terminal | TCP (127.0.0.1:8080) | Local MT5 bridge | Server accepts connections, no reconnect needed |
| 9 | Light crons | Vercel | HTTPS (curl) | POST /api/cron/* endpoints | Each timer fire is a fresh curl |
| 10 | Heavy jobs | Supabase Postgres | TCP/TLS | Job-specific DB writes | Pool auto-reconnects |
| 11 | Heavy jobs | FRED API | HTTPS | Economic data (fred-actuals, resonance-sync) | Per-call fetch, no persistent connection |
| 12 | Heavy jobs | CFTC API | HTTPS | CoT reports | Per-call fetch |
| 13 | Heavy jobs | AI Gateway | HTTPS | Embeddings, briefings, weekly review | Per-call |
| 14 | backup-db | Supabase Postgres | TCP/TLS | pg_dump | Per-run connection |
| 14b | backup-db | GCS | HTTPS | Store dump | Per-run |
| 15 | backup-journal | Supabase Postgres | TCP/TLS | psql JSON export | Per-run |
| 15b | backup-journal | GCS | HTTPS | Store JSON | Per-run |
| 16 | verify-restore | GCS | HTTPS | Pull latest dump | Per-run |
| 16b | verify-restore | Docker (local) | TCP | pg_restore in container | Per-run |
| 17 | update.sh | GitHub | HTTPS (git) | Fetch origin/main | Per-run |
| 18 | Vercel | Supabase Postgres | TCP/TLS | All web API routes | Pool (max=5, 8s stmt timeout) |
| 19 | Vercel | BiQuote | HTTPS | REST fallback for price/candles | Per-request |
| 20 | Vercel | Binance | HTTPS | REST fallback for crypto | Per-request |
| 21 | Vercel | TwelveData | HTTPS | REST fallback for forex/gold | Per-request |
| 22 | Vercel | Finnhub | HTTPS | Last-tier fallback | Per-request |
| 23 | Vercel | healthchecks.io | HTTPS | (not directly — VM handles HC) | N/A |

---

## 3. Worker Service Deep Analysis

### 3.1 Tick Data Flow (Worker → DB)

```
External Provider → WebSocket/SignalR → NormalizedTick
  │
  ├── handleIncomingTick(tick)
  │     ├── Priority filtering:
  │     │     MT5 ticks: always accepted, update lastMt5TickAt
  │     │     TwelveData ticks: always accepted, update lastTwelveDataTickAt
  │     │     BiQuote ticks: DROPPED if TwelveData tick < 5s ago
  │     │     BiQuote ticks: DROPPED if MT5 tick < 5s ago
  │     │     Binance ticks: always accepted (no priority conflict)
  │     │
  │     ├── buffer.push(tick) → TickBuffer holds latest tick per symbol
  │     ├── aggregator.feed(tick) → updates open 1m bar (OHLC + tick count)
  │     └── notifyWatchdog() → sd_notify WATCHDOG=1 (throttled to 30s)
  │
  ├── 1Hz flush timer:
  │     └── flushLiveTicks()
  │           ├── buffer.drain() → gets latest tick per symbol
  │           ├── INSERT INTO live_ticks ... ON CONFLICT (symbol) DO UPDATE
  │           └── Returns { written, totalTicks }
  │
  └── Candle aggregator (on minute rollover):
        └── flushClosedCandle()
              ├── INSERT INTO candles_1m ... ON CONFLICT DO NOTHING
              └── source field now correctly tracks tick source (B1 fix)
```

**Verdict: ✅ Tick flow is correct.** The priority system prevents duplicate ticks from multiple sources. The 1Hz flush cadence is appropriate for Supabase Free. The candle aggregator correctly tracks the source of each bar (post-B1 fix).

### 3.2 SymbolManager Flow (DB → Worker subscriptions)

```
Every 60s:
  SymbolManager.poll()
    ├── SELECT DISTINCT symbol FROM user_symbols
    ├── If empty → fallback to XAUUSD, EURUSD, GBPUSD
    ├── Compare with previous set
    ├── If changed:
    │     ├── Capture oldSymbols BEFORE updating (post-B1 fix)
    │     ├── Emit 'symbolsChanged' → BiQuote consumer updates
    │     ├── Emit 'twelvedataChanged' → TwelveData consumer updates (max 8 slots)
    │     ├── Emit 'biquoteChanged' → BiQuote consumer updates (forex + gold)
    │     └── Emit 'binanceChanged' → Binance consumer updates (crypto)
    └── On failure: consecutiveFailures++ (warns at 5+)
```

**Verdict: ✅ Symbol management is correct.** The B1 fix ensures `added`/`removed` arrays are properly computed for BiQuote and Binance events. The staleness counter (R10 fix) warns when the DB is unreachable.

### 3.3 Health Endpoint Flow

```
GET /health (127.0.0.1:8081)
  ├── lastTickAt = worker.getLastTickAt()
  ├── ageMs = Date.now() - lastTickAt
  ├── healthy = lastTickAt > 0 && ageMs < 120_000
  ├── 200 { status: 'ok', lastTickAgeMs, signalrConnected, uptimeMs } if healthy
  └── 503 { status: 'degraded', ... } if not healthy

GET /biquote/* (127.0.0.1:8081)
  ├── If BIQUOTE_PROXY_TOKEN set: require Bearer auth
  ├── fetch(target, { timeout: 10s })
  └── Return response body + status
```

**Verdict: ✅ Health endpoint is meaningful.** Post-O1 fix, it returns real worker state (tick age, SignalR status) instead of always returning 200. The BiQuote proxy is now secured with bearer auth (S1 fix) and bound to localhost.

---

## 4. Every Cron Job & Systemd Timer Analysis

### 4.1 Light Crons (VM → Vercel via curl)

| Job | Timer | Service | Flow | Status |
|-----|-------|---------|------|--------|
| news | `*:0/5` (every 5m) | `hamafx-light-news.service` | curl POST → Vercel `/api/cron/news` → Marketaux API → `economic_events` table | ✅ Working. Runs as `hamafx` user (post-S3 fix). HC ping in ExecStartPost. |
| calendar | `*:0/15` (every 15m) | `hamafx-light-calendar.service` | curl POST → Vercel `/api/cron/calendar` → FRED API → `economic_events` table | ✅ Working. Same pattern as news. |
| alerts | `*:0/5` (every 5m) | `hamafx-light-alerts.service` | curl POST → Vercel `/api/cron/alerts` → evaluateAlerts() → push notifications | ✅ Working. Same pattern. |
| warm-cache | `*:0/2` (every 2m) | `hamafx-light-warm-cache.service` | curl POST → Vercel `/api/cron/warm-cache` → pre-fetch market data | ✅ Working. Same pattern. |
| cleanup-uploads | `daily 03:00` | `hamafx-light-cleanup-uploads.service` | curl POST → Vercel `/api/cron/cleanup-uploads` → delete old chat images | ✅ Working. HC ping uses `/0` suffix (running ping). |

**Light cron flow:**
```
systemd timer fires
  → hamafx-light-*.service starts (Type=oneshot, User=hamafx)
  → curl -fsS -m 30 -H "Authorization: Bearer $CRON_SECRET" $PRODUCTION_URL/api/cron/<job>
  → Vercel route validates CRON_SECRET
  → Vercel route processes the job (API calls, DB writes)
  → curl exits 0 (success) or non-zero (failure)
  → ExecStartPost: curl healthchecks.io ping
```

**Verdict: ✅ All light crons are working correctly.** They run as the `hamafx` user with systemd hardening (post-S3 fix). The `CRON_SECRET` bearer token authenticates each request. Healthcheck pings fire after each run.

### 4.2 Heavy Jobs (VM-local Node.js processes)

| Job | Timer | Service | DB Table Written | Status |
|-----|-------|---------|-----------------|--------|
| briefings | `*:0/5` | `hamafx-job-briefings.service` | `briefings_emitted` | ✅ Working. Scans `economic_events` for pre/post-event windows. Idempotent on (eventId, kind). |
| snapshots | `daily 00:05` | `hamafx-job-snapshots.service` | `snapshots` + prunes `candles_1m` | ✅ Working. Computes HLOC/pivots/ATR per symbol. Count-before-delete (post-P1 fix). |
| cot | `Fri 22:00` | `hamafx-job-cot.service` | `cot_reports` | ✅ Working. CFTC weekly ingestion. Idempotent on (symbol, report_date). |
| fred-actuals | `daily 01:30` | `hamafx-job-fred-actuals.service` | `economic_events` (patches `actual`) | ✅ Working. Backfills missing actual values from FRED. |
| weekly-review | `Sun 18:00` | `hamafx-job-weekly-review.service` | `journal_entries` | ✅ Working. AI-authored weekly review per user. |
| resonance-sync | `daily 23:00` | `hamafx-job-resonance-sync.service` | `intermarket_resonance` | ✅ Working. Batch insert (post-P3 fix). DXY set to null (post-B5 fix). |
| embedding-backfill | `every 6h` | `hamafx-job-embedding-backfill.service` | `memory_embeddings` | ✅ Working. Embeds news articles missing embeddings. |
| alerts | `every 1m` (Docker only) | N/A (runs in worker process) | `alerts` evaluation | ✅ Working. Only runs when `WORKER_MODE=docker`. In systemd mode, alerts run via light cron on Vercel. |

**Heavy job flow:**
```
systemd timer fires
  → hamafx-job-*.service starts (Type=oneshot, User=hamafx)
  → EnvironmentFile=/opt/hamafx/.env loaded
  → HAMAFX_RUNTIME=worker, NODE_ENV=production set
  → node dist/runner/cli.js <job-name>
  → cli.ts:
      ├── loadEnv() → zod validates env
      ├── createLogger() → JSON to journald
      ├── initSentry() → no-op if unset
      ├── resolveHcUuid() → maps job name to HC UUID
      ├── SIGTERM handler → AbortController
      ├── withHeartbeat(hcUuid, () => job.run({ log, signal }))
      │     ├── ping(uuid, 'start')
      │     ├── job.run() → DB reads/writes, API calls
      │     ├── ping(uuid, 'success', duration)
      │     └── or ping(uuid, 'fail', error)
      └── flushSentry(2_000)
  → Exit 0 (success) or 2 (job failed)
```

**Verdict: ✅ All heavy jobs are working correctly.** Each job has its own healthcheck UUID, idempotency guards (via `acquireCronLock` for daily jobs), and AbortSignal support for clean cancellation. The `StartLimitBurst=5` (post-O5 fix) prevents excessive retries.

### 4.3 Infrastructure Jobs

| Job | Timer | Purpose | Status |
|-----|-------|---------|--------|
| update | `OnBootSec=2min, OnUnitActiveSec=5min` | Git pull + build + restart worker | ✅ Working. Robust rollback (post-R3 fix). No tests on VM (post-R4 fix). Post-deploy health check. |
| backup-db | `daily 03:00` | pg_dump → GCS | ✅ Working. Pooled URL warning (post-R7 fix). |
| backup-journal | `daily 03:05` | JSON export → GCS | ✅ Working. |
| verify-restore | `Sun 04:00` | pg_restore in Docker + assert | ✅ Working. pg16 (post-B8 fix). Container readiness check (post-R8 fix). Docker image prune (post-R11 fix). |
| tenant-export | `Sun 05:00` | JSON export to GCS | ✅ Working. SQL injection fix (post-S2 fix). |
| tenant-delete | `Sun 05:30` | Dry-run delete rehearsal | ✅ Working. SQL injection fix (post-S2 fix). |
| disk-check | `hourly` | df check + HC ping if >85% | ✅ Working. New unit (post-R5/O3 fix). |
| docker-prune | `Sun 05:00` | docker image prune -f | ⚠️ Issue found — see §6.1 |

---

## 5. Data Flow: Worker → DB → Frontend

### 5.1 Live Price Flow

```
Worker VM                           Supabase Postgres              Vercel (apps/web)
                                     ┌───────────┐
BiQuote SignalR ──tick──>            │ live_ticks │ <──read── /api/market/price
Binance WS ──tick──>   handleTick →  │ (3 rows,  │           │
TwelveData WS ──tick──>              │  UPSERT)  │           ▼
MT5 TCP ──tick──>                    └───────────┘     getPriceWithMeta()
                                     ┌───────────┐       │
                                     │ candles_1m│ <──read── /api/market/candles
                                     │ (14-day   │           │
                          1m close → │  retention)│          ▼
                                     └───────────┘     getCandles()
                                                          │
                                                     failover chain:
                                                     1. live-ticks (DB) ← worker writes this
                                                     2. biquote (REST) ← direct from Vercel
                                                     3. binance (REST) ← direct from Vercel (crypto)
                                                     4. twelvedata (REST) ← if API key
                                                     5. finnhub (REST) ← if API key
```

**How the frontend gets live prices:**
1. Browser polls `GET /api/market/price?symbol=XAUUSD` every 1.5s
2. Vercel route calls `getPriceWithMeta()` from `@hamafx/data`
3. `getPriceWithMeta()` tries providers in order:
   - **live-ticks**: reads `live_ticks` table (written by worker at 1Hz). If row is <5s old → serve directly. Zero outbound HTTP.
   - **biquote**: REST call to `https://biquote.io` (or `BIQUOTE_BASE_URL`). Fallback when worker is down.
   - **binance**: REST call for crypto symbols.
   - **twelvedata**: REST call if API key configured.
   - **finnhub**: REST call if API key configured.
4. Result cached for 3 seconds (s-maxage=3, stale-while-revalidate=15)

**When the VM is down:**
- `live_ticks` rows go stale (>5s old)
- `live-ticks` provider throws `ProviderEmptyError`
- Failover falls through to BiQuote REST / Binance REST
- Frontend continues working with REST-sourced prices
- `stale: true` flag is NOT set (REST is considered fresh, just different source)
- The `source` field in the tick changes from `biquote-signalr` to `biquote`

**Verdict: ✅ Price flow has automatic failover.** The VM being down does NOT break the frontend's ability to show prices. The live-ticks → BiQuote REST fallback is seamless.

### 5.2 Candle Data Flow

```
Worker VM                           Supabase Postgres              Vercel (apps/web)
                                     ┌───────────┐
All tick sources ──tick──>           │ candles_1m│ <──read── /api/market/candles
  → Candle1mAggregator               │           │           │
  → On minute close:                 │ (symbol,  │           ▼
    flushClosedCandle() ──INSERT──>  │  t) PK    │     getCandles()
                                     │  14-day   │       │
                                     │  retention)│      failover:
                                     └───────────┘       1. candles_1m (DB) ← worker writes this
                                                         2. biquote OHLC (REST)
                                                         3. binance (REST, crypto)
                                                         4. twelvedata (REST)
                                                         5. finnhub (REST)
```

**How the frontend gets candles:**
1. `GET /api/market/candles?symbol=XAUUSD&tf=1h&count=300`
2. Vercel route calls `getCandles()` from `@hamafx/data`
3. `getCandles()` tries the `candles-1m` pseudo-provider first (reads `candles_1m` table)
4. If stale or insufficient data → falls through to BiQuote/Binance/TwelveData REST
5. The `candles_1m` table only stores 1m bars. For higher timeframes (1h, 4h, 1d), the REST providers are used directly.

**Verdict: ✅ Candle flow has automatic failover.** The `candles_1m` table is primarily used for 1m candle data and alert preview calculations. Higher timeframes always go to REST providers.

### 5.3 Job-Produced Data Flow (Worker → DB → AI Tools → Frontend)

```
Worker VM                           Supabase Postgres              Vercel / AI Tools
                                     ┌─────────────────┐
snapshots job ──UPSERT──>            │ snapshots       │ <──read── get-system-diagnostics tool
                                     │                 │           run-system-action tool
                                     ├─────────────────┤
cot job ──UPSERT──>                  │ cot_reports     │ <──read── get-cot AI tool
                                     │                 │
                                     ├─────────────────┤
fred-actuals job ──UPDATE──>         │ economic_events │ <──read── get-calendar AI tool
calendar cron ──INSERT──>            │                 │           analyze-fundamental tool
news cron ──INSERT──>                │                 │           forecast-volatility tool
                                     ├─────────────────┤
resonance-sync job ──UPSERT──>       │ intermarket_    │ <──read── get-intermarket-resonance tool
                                     │   resonance     │           get-system-diagnostics tool
                                     ├─────────────────┤
briefings job ──INSERT──>            │ briefings_      │ <──read── get-system-diagnostics tool
                                     │   emitted       │
                                     ├─────────────────┤
weekly-review job ──INSERT──>        │ journal_entries │ <──read── journal UI components
                                     │                 │
                                     ├─────────────────┤
embedding-backfill job ──UPDATE──>   │ memory_         │ <──read── AI memory retrieval
                                     │   embeddings    │
                                     ├─────────────────┤
alerts cron ──evaluate──>            │ alerts          │ <──read── alerts dashboard UI
                                     │                 │
                                     └─────────────────┘
```

**Verdict: ✅ All job-produced data is consumed by the frontend or AI tools.** Every table written by a worker job has at least one reader in the Vercel app or AI tools package.

### 5.4 BiQuote Proxy Flow (VM → Vercel)

```
Vercel serverless function
  └── getPriceWithMeta() → biquote.fetchTick(symbol, { baseUrl: BIQUOTE_BASE_URL })
        ├── If BIQUOTE_BASE_URL = 'https://biquote.io' (default) → direct to BiQuote
        └── If BIQUOTE_BASE_URL = 'http://<VM_IP>:8081/biquote' → through VM proxy
              ⚠️ NOW BROKEN: VM proxy binds to 127.0.0.1, not accessible from Vercel
```

**Issue: ⚠️ The BiQuote proxy is now inaccessible from Vercel.** The health server was correctly bound to `127.0.0.1` for security (S1 fix), but this means Vercel can no longer use the VM as a BiQuote proxy. By default this is fine (Vercel goes directly to `https://biquote.io`), but if `BIQUOTE_BASE_URL` was configured on Vercel to point to the VM, that path is now broken. See §6.2.

---

## 6. Issues Found

### 6.1 New Issues (post-implementation)

#### N1. DB pool not closed on worker shutdown

**File:** `apps/worker/src/index.ts`
**Severity:** LOW

The worker's `stop()` function drains the tick buffer and closes all WebSocket connections, but never calls `closeDb()` from `@hamafx/db`. The `closeDb()` function exists and is exported, but is not imported or called anywhere in the worker.

On graceful shutdown, the postgres-js pool is left to be cleaned up by process exit. This is usually fine (OS closes sockets), but:
- Supabase pooler may show lingering connections for a few seconds
- Not a clean shutdown from the DB's perspective

**Fix:** Add `closeDb()` to the shutdown handlers in `index.ts`:
```typescript
import { closeDb } from '@hamafx/db';
// ...
onShutdown(() => closeDb());
```

#### N2. `hamafx-docker-prune.service` uses wrong healthcheck UUID

**File:** `infra/cron-vm/units/hamafx-docker-prune.service`
**Severity:** LOW

The docker-prune service pings `HC_DISK_CHECK_UUID` in its `ExecStartPost`:
```ini
ExecStartPost=/bin/sh -c 'test -z "$HC_DISK_CHECK_UUID" || /usr/bin/curl -fsS -m 5 "https://hc-ping.com/$HC_DISK_CHECK_UUID" || true'
```

This reuses the disk-check UUID for docker-prune. A successful docker-prune ping resets the disk-check healthcheck timer, which could mask a real disk-check failure.

**Fix:** Either:
1. Remove the healthcheck ping from docker-prune (it's a maintenance task, not critical), or
2. Add a separate `HC_DOCKER_PRUNE_UUID` to `env.ts` and use it here.

#### N3. `hamafx-docker-prune.service` runs as root without hardening

**File:** `infra/cron-vm/units/hamafx-docker-prune.service`
**Severity:** LOW

Docker requires root (or docker group), so `User=root` is necessary. But the service lacks `NoNewPrivileges=true`, `PrivateTmp=true`, etc. that all other services have.

**Fix:** Add hardening directives (keeping `User=root` since Docker needs it):
```ini
[Service]
Type=oneshot
User=root
NoNewPrivileges=true
PrivateTmp=true
```

#### N4. `setup.sh` no longer installs system packages

**File:** `infra/cron-vm/setup.sh`
**Severity:** MEDIUM

The diff removed `apt-get install curl logrotate sudo postgresql-client docker.io` from `setup.sh` and replaced it with journald config. This is fine when `setup.sh` is called from `_provision.sh` (which installs packages first), but `setup.sh`'s header comment still says it can be run standalone:
```
# Usage (from your local machine):
#   gcloud compute scp -r infra/cron-vm hamafx-cron:/tmp/hamafx-cron --zone=us-central1-a
#   gcloud compute ssh hamafx-cron --zone=us-central1-a --command="sudo bash /tmp/hamafx-cron/setup.sh"
```

If someone follows this instruction on a fresh VM, `curl` won't be installed and the light cron services will fail.

**Fix:** Either:
1. Add a comment to `setup.sh` saying "Run _provision.sh first — this script assumes packages are already installed", or
2. Add back the package installation with `apt-get install -y -qq curl logrotate sudo postgresql-client docker.io 2>/dev/null || true` (idempotent, won't re-install if present).

#### N5. `update.sh` header comment is stale

**File:** `infra/cron-vm/update.sh`
**Severity:** LOW (cosmetic)

The header still says:
```
#   4. pnpm --filter @hamafx/worker test --run.
```
But tests are now skipped (the line is commented out). The comment should be updated.

**Fix:** Update the header:
```
#   4. (tests skipped on VM — CI handles testing)
```

#### N6. BiQuote proxy now inaccessible from Vercel

**File:** `apps/worker/src/index.ts`
**Severity:** LOW (only affects users who configured `BIQUOTE_BASE_URL` to point to the VM)

The health server now binds to `127.0.0.1` (S1 fix), which means the BiQuote proxy at `/biquote/*` is only accessible from the VM itself. Vercel serverless functions can no longer use the VM as a BiQuote proxy.

By default, Vercel goes directly to `https://biquote.io` (the default `BIQUOTE_BASE_URL`), so this is fine for most setups. But if someone had configured `BIQUOTE_BASE_URL=http://<VM_EXTERNAL_IP>:8081/biquote` on Vercel, that path is now broken.

**Fix:** Document this in the README:
```markdown
> **Note:** The BiQuote proxy on the VM is now bound to 127.0.0.1 and is only
> accessible locally. Vercel should go directly to `https://biquote.io` (the
> default). If you previously configured `BIQUOTE_BASE_URL` on Vercel to point
> to the VM, remove that override.
```

If the proxy is needed from Vercel in the future, set up an SSH tunnel or a reverse proxy (nginx) with authentication.

#### N7. `resonance-sync.ts` batch insert lost abort signal check

**File:** `apps/worker/src/jobs/resonance-sync.ts`
**Severity:** LOW

The old code checked `ctx.signal?.aborted` inside the per-row loop. The new batch insert (P3 fix) removed this check. If the job is aborted during the batch insert, the single DB operation will complete anyway.

This is minor since it's a single INSERT statement (not a long loop), but technically the abort signal is ignored during persistence.

**Fix:** Check abort signal before the batch insert:
```typescript
if (ctx.signal?.aborted) {
  log.warn('resonance-sync aborted before persistence');
  return { processed: 0, note: 'aborted before persistence' };
}
if (dbRows.length > 0) {
  await db.insert(schema.intermarketResonance).values(dbRows)...
}
```

#### N8. `snapshots.ts` count-before-delete has TOCTOU race

**File:** `apps/worker/src/jobs/snapshots.ts`
**Severity:** VERY LOW

The P1 fix changed from `.returning()` to count-then-delete. Between the count query and the delete query, new rows could be inserted, making the count inaccurate. This is extremely unlikely (the worker writes candles at most 1/minute) and the count is only used for logging, not for correctness.

**Fix:** Not needed — the count is informational only. The delete itself is correct regardless of the count.

#### N9. `hamafx-docker-prune.timer` and `hamafx-tenant-export.timer` both fire at Sun 05:00

**Files:** `infra/cron-vm/units/hamafx-docker-prune.timer`, `infra/cron-vm/units/hamafx-tenant-export.timer`
**Severity:** VERY LOW

Both timers are scheduled for Sunday 05:00 UTC. While they run as separate services and won't conflict, running them simultaneously adds load to the VM. The docker-prune could be moved to a different time (e.g., Sun 06:00) to avoid overlap.

**Fix:** Change `hamafx-docker-prune.timer` to `Sun *-*-* 06:00:00 UTC`.

### 6.2 Pre-existing Issues That Are Now Resolved

All issues from the first analysis (S1-S5, B1-B8, R1-R12, P1-P3, O1-O7, D1-D6, T1) have been implemented in commit `3855e93`. The following were verified as correctly fixed:

- ✅ S1: Health server binds to `127.0.0.1` + proxy auth
- ✅ S2: SQL injection fixed with psql variables
- ✅ S3: Light cron services run as `hamafx` with hardening
- ✅ S4: MT5 server (loopback only, documented)
- ✅ S5: GCP firewall rules in `_provision.sh`
- ✅ B1: SymbolManager captures `oldSymbols` before update
- ✅ B2: Candle aggregator tracks `source` per bar
- ✅ B3: Docker scheduler aligned with systemd timers
- ✅ B4: `uncaughtException` now exits process
- ✅ B5: DXY set to `null` instead of `100.0`
- ✅ B6: `alerts` case added to `resolveHcUuid`
- ✅ B7: Binance consumer skips when no symbols
- ✅ B8: verify-restore uses pg16
- ✅ R1: `TimeoutStartSec=60`
- ✅ R2: `StartLimitBurst=10` on worker
- ✅ R3: Rollback fails loudly
- ✅ R4: Tests skipped on VM
- ✅ R5: Disk check timer
- ✅ R6: Journald limits
- ✅ R7: Pooled URL warning
- ✅ R8: Container readiness check
- ✅ R9: `TimeoutStopSec=30`
- ✅ R10: SymbolManager staleness counter
- ✅ R11: Docker image prune in verify-restore
- ✅ R12: Configurable fallback timeout
- ✅ P1: Count-before-delete in snapshots
- ✅ P3: Batch insert in resonance-sync
- ✅ O1: Health endpoint with real state
- ✅ O3: Disk check timer
- ✅ O4: Docker prune timer
- ✅ O5: StartLimitBurst on job services
- ✅ O6: BiQuote proxy URL configurable
- ✅ O7: pnpm store prune
- ✅ D1-D6: Documentation fixes

---

## 7. Implementation Plan for Fixes

### Phase 1: Quick Fixes (5 minutes each)

#### Fix N1: Close DB pool on shutdown
**File:** `apps/worker/src/index.ts`
```typescript
// Add import at top:
import { closeDb } from '@hamafx/db';

// Add to onShutdown registrations (after worker.stop, before flushSentry):
onShutdown(() => closeDb());
```

#### Fix N2: Docker-prune healthcheck UUID
**File:** `infra/cron-vm/units/hamafx-docker-prune.service`
```ini
# Option A: Remove the ping entirely (recommended — it's maintenance, not critical)
# Delete the ExecStartPost line.

# Option B: Use a separate UUID (requires adding HC_DOCKER_PRUNE_UUID to env.ts)
ExecStartPost=/bin/sh -c 'test -z "$HC_DOCKER_PRUNE_UUID" || /usr/bin/curl -fsS -m 5 "https://hc-ping.com/$HC_DOCKER_PRUNE_UUID" || true'
```

#### Fix N3: Docker-prune hardening
**File:** `infra/cron-vm/units/hamafx-docker-prune.service`
```ini
[Service]
Type=oneshot
User=root
NoNewPrivileges=true
PrivateTmp=true
```

#### Fix N4: setup.sh package installation
**File:** `infra/cron-vm/setup.sh`
```bash
# Add after the journald config block:
log 'ensuring system packages are installed'
apt-get update -qq
apt-get install -y -qq curl logrotate sudo postgresql-client docker.io 2>/dev/null || true
```

#### Fix N5: update.sh stale comment
**File:** `infra/cron-vm/update.sh`
```bash
# Change line 12 from:
#   4. pnpm --filter @hamafx/worker test --run.
# To:
#   4. (tests skipped on VM — CI runs them on every PR/push)
```

#### Fix N7: resonance-sync abort check
**File:** `apps/worker/src/jobs/resonance-sync.ts`
```typescript
// Before the batch insert, add:
if (ctx.signal?.aborted) {
  log.warn('resonance-sync aborted before persistence');
  return { processed: 0, note: 'aborted before persistence' };
}
```

#### Fix N9: Docker-prune timer schedule
**File:** `infra/cron-vm/units/hamafx-docker-prune.timer`
```ini
[Timer]
OnCalendar=Sun *-*-* 06:00:00 UTC
```

### Phase 2: Documentation

#### Fix N6: Document BiQuote proxy change
**File:** `infra/cron-vm/README.md`
Add to the "Architecture" section:
```markdown
> **BiQuote Proxy:** The worker's health server includes a BiQuote REST proxy
> at `/biquote/*`, but it is bound to `127.0.0.1` and only accessible from the
> VM itself. Vercel should go directly to `https://biquote.io` (the default
> `BIQUOTE_BASE_URL`). If you previously configured `BIQUOTE_BASE_URL` on Vercel
> to point to the VM, remove that override.
```

### Phase 3: Optional Enhancements

#### Enhancement 1: Add `HC_DOCKER_PRUNE_UUID` to env.ts
**File:** `apps/worker/src/env.ts`
```typescript
HC_DOCKER_PRUNE_UUID: optionalNonEmpty,
```

#### Enhancement 2: Add `closeDb()` to runner/cli.ts
**File:** `apps/worker/src/runner/cli.ts`
```typescript
// In the finally block, add:
await closeDb();
```
This ensures one-shot job processes also clean up their DB connections.

---

## Appendix: Verification Checklist

### Boot/Restart Verification
- [ ] Worker starts automatically on VM boot (WantedBy=multi-user.target)
- [ ] All 20 timers activate on boot (WantedBy=timers.target)
- [ ] Persistent timers catch up on missed runs
- [ ] Non-persistent timers skip missed runs and resume on schedule
- [ ] Self-update timer fires 2 minutes after boot
- [ ] Worker sends READY=1 to systemd after all connections established
- [ ] WatchdogSec=120 starts after READY=1
- [ ] Worker sends WATCHDOG=1 every 30s (throttled) while ticks are flowing

### Shutdown Verification
- [ ] SIGTERM triggers graceful shutdown
- [ ] Tick buffer is drained to DB on shutdown
- [ ] All WebSocket connections are closed
- [ ] Health server is closed
- [ ] Sentry and Langfuse are flushed
- [ ] Process exits within 30s (TimeoutStopSec=30)
- [ ] DB pool is closed (after N1 fix)

### Crash Recovery Verification
- [ ] systemd restarts worker within 5s (RestartSec=5)
- [ ] After 10 restarts in 5 min, systemd stops retrying (StartLimitBurst=10)
- [ ] SignalR reconnects with automatic + manual backoff
- [ ] Binance WS reconnects with delay schedule
- [ ] TwelveData WS reconnects with delay schedule
- [ ] SymbolManager re-polls DB on restart
- [ ] live_ticks table persists across crashes
- [ ] candles_1m table persists across crashes

### Data Flow Verification
- [ ] Worker writes live_ticks at 1Hz (UPSERT per symbol)
- [ ] Worker writes candles_1m on minute close (INSERT ON CONFLICT DO NOTHING)
- [ ] Vercel reads live_ticks as first price provider
- [ ] Vercel falls back to BiQuote REST when live_ticks is stale (>5s)
- [ ] Vercel falls back to Binance REST for crypto when live_ticks is stale
- [ ] All job-produced tables are read by AI tools or frontend
- [ ] Light crons successfully POST to Vercel with CRON_SECRET auth
- [ ] Heavy jobs write to correct DB tables
- [ ] Healthchecks.io receives pings for all jobs

### Self-Update Verification
- [ ] update.sh detects new commits on main
- [ ] update.sh builds and restarts worker
- [ ] Post-deploy health check catches crash loops
- [ ] Rollback restores previous SHA and restarts worker
- [ ] Rollback pings healthchecks.io with failure message
- [ ] pnpm store is pruned after successful update
