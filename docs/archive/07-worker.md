# 07 — Worker Daemon

## Overview

The HamaFX-Ai worker (`apps/worker/`) is a persistent Node.js daemon that runs on a GCE VM under systemd. It maintains live tick feeds from BiQuote (via SignalR) and MetaTrader 5 (via a local TCP bridge), aggregates 1-minute candles in-process, and executes seven scheduled heavy jobs via systemd one-shot timers.

| Property | Value |
|---|---|
| Language | TypeScript (strict) |
| Build tool | esbuild (bundled), not Next.js |
| Package manager | pnpm (Turborepo monorepo) |
| Deployment target | GCE e2-medium VM, Ubuntu |
| Process manager | systemd (`Type=notify`) |
| DB pool | Postgres via `postgres-js`, pool size 3 |
| Local dev DB | PGlite (embedded Postgres, `NODE_ENV != production`) |

## Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────┐
│                          GCE VM                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              hamafx-worker.service                    │   │
│  │                     (Type=notify)                     │   │
│  │                                                      │   │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────────┐   │   │
│  │  │  SignalR │    │  MT5     │    │ systemd-notify│   │   │
│  │  │ Consumer │    │  Bridge  │    │ (READY/WATCHDOG)  │   │
│  │  │ (BiQuote)│    │ (TCP:8080)   └──────────────┘   │   │
│  │  └────┬─────┘    └────┬─────┘                      │   │
│  │       │               │                             │   │
│  │       └───────┬───────┘                             │   │
│  │               ▼                                     │   │
│  │  ┌──────────────────────┐                           │   │
│  │  │  handleIncomingTick  │  ◄── MT5 primary,         │   │
│  │  │                      │      BiQuote fallback     │   │
│  │  └──────┬───────────────┘                           │   │
│  │         │                                           │   │
│  │    ┌────┴────┐                                      │   │
│  │    ▼         ▼                                      │   │
│  │ ┌─────┐  ┌───────────────┐                          │   │
│  │ │Tick │  │Candle1m       │                          │   │
│  │ │Buf  │  │Aggregator     │                          │   │
│  │ └──┬──┘  └───────┬───────┘                          │   │
│  │    │             │                                  │   │
│  │    │  1Hz flush  │  on minute boundary              │   │
│  │    ▼             ▼                                  │   │
│  │ ┌──────────┐ ┌──────────────┐                      │   │
│  │ │live_ticks│ │ candles_1m   │                      │   │
│  │ │(UPSERT)  │ │ (INSERT)     │                      │   │
│  │ └──────────┘ └──────────────┘                      │   │
│  │                                                     │   │
│  │  HTTP Healthcheck (Port 8081) /health               │   │
│  │  Heartbeat → healthchecks.io every 30s              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  systemd timers:                                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Heavy jobs (one-shot via runner CLI):                   │  │
│  │   briefings · snapshots · cot · fred-actuals           │  │
│  │   weekly-review · embedding-backfill · resonance-sync  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Light HTTP pokers → Vercel /api/cron/*:                │  │
│  │   news (5m) · calendar (15m) · alerts (5m) ·           │  │
│  │   warm-cache (2m)                                      │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Maintenance:                                            │  │
│  │   update (5m) · backup-db (nightly) ·                  │  │
│  │   backup-journal (nightly) · verify-restore (weekly)   │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Entry Point: `apps/worker/src/index.ts`

The entry file (293 lines) exports `main()` and `runWorker()`. The former is the CLI entry; the latter is the testable core that composes the full pipeline.

### `main()` lifecycle

1. **loadEnv** — parses `process.env` through `WorkerEnvSchema` (Zod). Fails fast with a readable error listing every missing/invalid variable.
2. **createLogger** — JSON-structured in production (`NODE_ENV=production`), pretty-printed in development.
3. **initSentry** — initializes error reporting (optional; no-op when `SENTRY_DSN` is unset).
4. **installSignalHandlers** — listens for `SIGTERM`/`SIGINT`. Runs registered cleanup callbacks in reverse order, then `process.exit(0)`. A second signal forces `process.exit(1)`.
5. **runWorker()** — composes the pipeline and returns a `RunningWorker` handle.
6. Registers `unhandledRejection` and `uncaughtException` handlers that report to Sentry before the process dies.

`main()` only auto-executes when `import.meta.url` matches `process.argv[1]` — this keeps test imports side-effect-free.

### `runWorker()` pipeline

The core composable function. Takes explicit dependencies (connection factory, intervals, onTick tap) so tests can drive the same wiring with stubs.

```
runWorker({ env, log, buildConnection?, flushIntervalMs?, heartbeatIntervalMs?, onTick? })
```

Pipeline steps:

1. **Creates `TickBuffer`** — per-symbol latest-tick map.
2. **Creates `Candle1mAggregator`** — in-process 1-minute bar tracker. On each closed bar, calls `flushClosedCandle()` to persist.
3. **Connects `SignalRConsumer`** — builds a real `@microsoft/signalr` `HubConnection` (lazy-imported so tests don't need the package). Subscribes to all three symbols.
4. **Starts MT5 bridge** — `startMT5Server()` on localhost. Receives newline-delimited JSON from the MetaTrader 5 EA.
5. **Shared tick handler** — `handleIncomingTick()` routes ticks from both sources:

   ```
   handleIncomingTick(tick):
     if tick.source === 'mt5-local':
       lastMt5TickAt = now
     elif tick.source === 'biquote-signalr' AND (now - lastMt5TickAt) < 15s:
       DROP  // MT5 is primary; BiQuote is fallback during MT5 active window
     else:
       buffer.push(tick)
       aggregator.feed(tick)
       onTick?(tick)
       notifyWatchdog()
   ```

6. **Notify systemd** — `notifyReady()` + `notifyStatus('signalr connected; tick stream active')` so the unit transitions to `active (running)`.
7. **1 Hz flush loop** — `setInterval` drains `TickBuffer` and UPSERTs into `live_ticks` every 1000ms.
8. **30 s heartbeat** — `setInterval` pings healthchecks.io with `success` if a tick arrived in the last 60 s, or `fail` otherwise.
9. **HTTP Healthcheck** — A simple HTTP server listens on port `8081` responding to `/health` with `{"status":"ok"}`. This is used by Docker liveness probes.
10. **Returns `RunningWorker`** with `{ consumer, buffer, aggregator, stop() }`. The `stop()` method drains the buffer, force-closes all open candles, and tears down both connections.

## SignalR Consumer

File: `apps/worker/src/signalr/consumer.ts` (313 lines)

### Connection lifecycle

- **Endpoint**: `https://biquote.io/hubs/tick` (configurable via `BIQUOTE_HUB_URL`)
- **Protocol**: `@microsoft/signalr` with automatic reconnect
- **Channel**: `ReceiveTick` — server-pushed ticks
- **Subscription**: `conn.invoke('Subscribe', symbols[])` / `Unsubscribe`
- **Symbols**: XAUUSD, EURUSD, GBPUSD (from `@hamafx/shared`)

### Automatic reconnect (SignalR SDK)

The `HubConnectionBuilder` is configured with `withAutomaticReconnect([0, 2000, 5000, 10000, 30000])`:
- 0 ms — immediate retry (common blip)
- 2 s, 5 s, 10 s, 30 s — escalating backoff
- After the schedule is exhausted, the SDK fires `onclose` and stops trying

### Manual rebuild loop

When the SDK gives up (fires `onclose`), the consumer initiates its own rebuild loop with exponential backoff capped at 60 s, with ±25 % jitter:

```
reconnectAttempt += 1
delay = min(60_000, 2_000 * 2^(attempt-1)) * jitter(±25%)
```

The rebuild builds a fresh `HubConnection`, calls `start()`, and resubscribes. On success the attempt counter resets; on failure it schedules another attempt.

### Tick handling

`handleTick(raw)` validates each incoming tick:

1. **Schema validation** — `BiquoteSignalRTickSchema.safeParse(raw)`. On failure, logs observed keys (not values — to avoid splattering price data) and drops.
2. **Symbol filter** — `isSymbol(tick.symbol)` discards non-supported symbols.
3. **Timestamp parsing** — accepts ms epoch or ISO-8601 strings. Heuristic: numbers < 1e12 are treated as seconds and promoted to ms.
4. **Normalization** — produces `NormalizedTick { symbol, bid, ask, mid, ts, source: 'biquote-signalr' }`.
5. **Dispatch** — calls `onTick(normalized)`. Errors from the handler are logged and swallowed (never crash the consumer).

### Tick buffer

File: `apps/worker/src/signalr/tick-buffer.ts` (68 lines)

Pure data structure — no IO, no logging. A `Map<Symbol, Slot>` where each slot holds the latest tick and an observation counter.

| Method | Behavior |
|---|---|
| `push(tick)` | Replaces existing tick for the symbol, increments `observed` counter. O(1). |
| `drain()` | Returns array of `{ tick, observed }` for all symbols since last drain, clears the map. |
| `size()` | Returns number of buffered symbols (test helper). |

The 1 Hz flush loop calls `buffer.drain()`, maps to DB row shapes, and issues a single `INSERT ... ON CONFLICT (symbol) DO UPDATE` with Drizzle.

```
Buffer at 200 tick/s  ──►  drain at 1 Hz  ──►  3 UPSERTs/sec to live_ticks
```

## Candle Aggregator

File: `apps/worker/src/aggregator/candle-1m.ts` (125 lines)

Pure-data, in-process 1-minute OHLC bar builder. No IO — the persistence path (`flushClosedCandle`) is wired at the worker bootstrap level.

### Internal model

```
OpenBar {
  bucket: number    // floor(ts / 60_000)
  o: number         // first mid-price of the minute
  h: number         // highest mid
  l: number         // lowest mid
  c: number         // latest mid
  ticks: number     // count of ticks in this bar
}
```

### `feed(tick)`

| Condition | Action |
|---|---|
| No open bar for symbol | Create new bar: `o=h=l=c=tick.mid`, `ticks=1` |
| `tick.bucket < bar.bucket` | Stale tick — silently ignore |
| `tick.bucket == bar.bucket` | Update h/l/c, increment ticks |
| `tick.bucket > bar.bucket` | Close previous bar, start fresh bar |

Bar rollover: if the tick lands in a new minute (`bucket > bar.bucket`), the previous bar is emitted via `onClosed(candle)`. Multiple-minute gaps (e.g. weekend) emit one closed bar — empty bars for missing minutes are not created.

### `closeAll()`

Force-closes every currently-open bar. Called during graceful shutdown so no partial bar is lost. Downstream consumers can detect partial bars via `tickVolume` being lower than normal.

### Emitted shape

```typescript
ClosedCandle {
  symbol: Symbol
  t: number          // bar open time, ms epoch, aligned to minute start
  o: number          // open
  h: number          // high
  l: number          // low
  c: number          // close
  v: null            // real volume (null for FX)
  tickVolume: number // ticks in the bar
  source: 'biquote-signalr'
}
```

## Persistence

### `live_ticks` writer

File: `apps/worker/src/persistence/live-ticks.ts` (98 lines)

Writes latest tick per symbol to `live_ticks` table.

```sql
INSERT INTO live_ticks (symbol, bid, ask, mid, ts, source)
VALUES (...)
ON CONFLICT (symbol) DO UPDATE SET
  bid = excluded.bid,
  ask = excluded.ask,
  mid = excluded.mid,
  ts = excluded.ts,
  source = excluded.source,
  updated_at = now()
```

Returns `{ written, totalTicks }` summary for logging.

### `candles_1m` writer

File: `apps/worker/src/persistence/candles-1m.ts` (57 lines)

Writes one closed bar per symbol per minute boundary.

```sql
INSERT INTO candles_1m (symbol, t, o, h, l, c, v, tick_volume, source)
VALUES (...)
ON CONFLICT DO NOTHING
```

Idempotent on `(symbol, t)` — worker restarts that re-emit the same bar are safe.

## MT5 Bridge

File: `apps/worker/src/mt5-server.ts` (95 lines)

A local TCP server that receives newline-delimited JSON tick frames from a MetaTrader 5 Expert Advisor running on the same machine (or accessible via loopback).

### Protocol

- **Transport**: raw TCP on `127.0.0.1:{MT5_BRIDGE_PORT}` (default 8080)
- **Framing**: newline-delimited JSON (one JSON object per line)
- **Frame format**:
  ```json
  {"symbol": "XAUUSD", "bid": 2955.32, "ask": 2955.68, "ts": 1718700000000}
  ```
- **Validation**: symbol must be one of XAUUSD/EURUSD/GBPUSD; bid/ask must be finite numbers
- **Output**: produces `NormalizedTick` with `source: 'mt5-local'`

### MT5 as primary source

The shared `handleIncomingTick()` enforces MT5 priority: when an MT5 tick arrives, `lastMt5TickAt` is updated. BiQuote ticks are silently dropped if MT5 has been active within the last 15 seconds. This prevents stale BiQuote data from overwriting local MT5 ticks when both are connected.

## systemd Integration

### sd_notify client

File: `apps/worker/src/sd-notify.ts` (76 lines)

Talks to systemd via the `systemd-notify` CLI (avoids native bindings for AF_UNIX sockets). All calls are no-ops when `$NOTIFY_SOCKET` is absent (dev/test/non-Linux).

| Function | Message | Trigger |
|---|---|---|
| `notifyReady()` | `READY=1` | Once, after SignalR connected and subscribed |
| `notifyStatus(msg)` | `STATUS=<msg>` | After `READY=1`, surfaces connection state |
| `notifyStopping()` | `STOPPING=1` | On SIGTERM, before cleanup |
| `notifyWatchdog()` | `WATCHDOG=1` | On every tick, throttled to once per 30 s |

### Main service: `hamafx-worker.service`

| Setting | Value | Rationale |
|---|---|---|
| `Type` | `notify` | Unit only enters `active` after `READY=1` |
| `WatchdogSec` | `120` | 4× the 30 s watchdog throttle; tolerates 3 missed pings |
| `WatchdogSignal` | `SIGTERM` | Allows graceful shutdown (flush buffers) instead of SIGABRT |
| `Restart` | `always` | Automatic recovery from crashes |
| `RestartSec` | `5` | Brief cooldown between restarts |
| `MemoryMax` | `1.5G` | Leaves ~2.5 GB on e2-medium for job one-shots |
| `TimeoutStartSec` | `30` | SignalR connection must complete within 30 s |
| `TimeoutStopSec` | `15` | Graceful shutdown deadline |
| `Environment` | `HAMAFX_RUNTIME=worker`, `NODE_ENV=production` | Worker pool size (3), JSON logger |
| `EnvironmentFile` | `/opt/hamafx/.env` | Secrets and configuration |
| `WorkingDirectory` | `/opt/hamafx/app/apps/worker` | Relative imports resolve |
| `ExecStart` | `node dist/index.js` | Bundled output |

Hardening:
- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `ProtectSystem=strict`
- `ProtectHome=true`
- `ReadWritePaths=/opt/hamafx`

## Scheduled Jobs

The worker runs 7 heavy jobs via systemd one-shot units. Each job has:
- A `<name>.timer` unit with `OnCalendar=` schedule
- A `<name>.service` unit that invokes `node dist/runner/cli.js <name>`
- A dedicated healthchecks.io UUID for independent alerting

### Job registry

File: `apps/worker/src/jobs/index.ts` (71 lines)

```typescript
export const JOBS: Record<JobName, { run: JobFn; description: string }>
```

Jobs implement `JobFn = (ctx: JobContext) => Promise<JobResult>` where `JobContext` provides a logger and an optional `AbortSignal` (triggered by SIGTERM from systemd).

### The 8 jobs

| Job | Schedule | Description |
|---|---|---|
| **briefings** | Every 5 min | Scans `economic_events` for high-impact releases. Pre-event window: [now+28m, now+32m]. Post-event window: [now-32m, now-28m] (only if `actual` is not null). Emits briefings idempotently via `(eventId, kind)` PK. |
| **alerts** | Every 1 min | Evaluates user-defined price and indicator alerts via `evaluateAlerts()`. Fires notifications on matched conditions. |
| **snapshots** | Daily 00:05 UTC | Computes daily HLOC + pivot points (PP/R1/R2/S1/S2) + ATR(14) per symbol from the last 240 1H candles. UPSERTs into `snapshots`. Prunes `candles_1m` to trailing 14 days. |
| **cot** | Friday 22:00 UTC | Ingests weekly CFTC Commitment of Traders report. Pulls positioning data for futures markets correlated to XAUUSD/EURUSD/GBPUSD. |
| **fred-actuals** | Daily 01:30 UTC | Backfills `economic_events.actual` where it was null at initial ingestion. Queries FRED API for released values matching previously scheduled events. |
| **weekly-review** | Sunday 18:00 UTC | Agent-authored weekly trading journal review. Summarizes the week's setups, outcomes, and performance metrics into a structured journal entry. |
| **embedding-backfill** | Every 6 hours | Computes vector embeddings for `news_articles` that are missing them. Uses the AI Gateway embedding model. Next run absorbs any backlog (no `Persistent=true`). |
| **resonance-sync** | Daily 01:00 UTC | Fetches real yield and DXY data from FRED, computes gold divergences, and stores intermarket resonance signals. Requires `FRED_API_KEY`. |

### Job runner CLI

File: `apps/worker/src/runner/cli.ts` (138 lines)

Entry point for systemd one-shot units:

```
ExecStart=/usr/bin/node /opt/hamafx/app/apps/worker/dist/runner/cli.js briefings
```

Lifecycle:
1. Parses job name from `process.argv[2]`
2. `loadEnv()` — fail-fast
3. Creates logger tagged `service: 'worker:job:<name>'`
4. `initSentry()` — error reporting
5. Sets up `AbortController` for SIGTERM handling
6. `withHeartbeat(hcUuid, ...)` — wraps the job in healthchecks.io start/success/fail pings
7. Exit codes: `0` (success), `1` (env/argv error), `2` (job threw)
8. Always calls `flushSentry(2000)` in `finally`

### Job service unit template

Each job service follows the same pattern:

```ini
[Unit]
Description=HamaFX-Ai job — <name>
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=hamafx
Group=hamafx
WorkingDirectory=/opt/hamafx/app/apps/worker
EnvironmentFile=/opt/hamafx/.env
Environment="HAMAFX_RUNTIME=worker"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /opt/hamafx/app/apps/worker/dist/runner/cli.js <name>

MemoryMax=512M
TimeoutStartSec=<varies>

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/hamafx

StandardOutput=journal
StandardError=journal
SyslogIdentifier=hamafx-job-<name>
```

### Embedded scheduler (dev mode)

File: `apps/worker/src/scheduler/embedded.ts` (115 lines)

For local development, the worker can run cron jobs in-process via `node-cron`. Registers all 8 jobs with their production cron expressions. Each is wrapped in try/catch so one failure doesn't affect others. Light crons (news/alerts/warm-cache) that require Vercel endpoints and API keys are skipped in embedded mode.

## Light HTTP Pokers

systemd timer units that `curl` Vercel `/api/cron/*` endpoints. These trigger serverless functions for lightweight periodic work that doesn't need a persistent process.

| Timer | Schedule | Endpoint |
|---|---|---|
| `hamafx-light-news` | Every 5 min | `POST /api/cron/news` |
| `hamafx-light-calendar` | Every 15 min | `POST /api/cron/calendar` |
| `hamafx-light-alerts` | Every 5 min | `POST /api/cron/alerts` |
| `hamafx-light-warm-cache` | Every 2 min | `POST /api/cron/warm-cache` |

Each uses `curl -fsS -m 30` with `Authorization: Bearer` from env. On success, optionally pings a healthchecks.io UUID.

## Self-Update

`hamafx-update.timer` fires every 5 minutes (`OnUnitActiveSec=5min`) with a 2-minute boot delay.

`hamafx-update.service` (oneshot) runs `update.sh`:
1. `git pull origin main`
2. `pnpm install --frozen-lockfile`
3. `pnpm --filter @hamafx/worker build`
4. Compares deployed SHA with previous; restarts `hamafx-worker` if changed

The `hamafx` user has passwordless sudo for `systemctl restart hamafx-worker` via `sudoers.d/hamafx`.

## Backups

| Timer | Schedule | Action |
|---|---|---|
| `hamafx-backup-db` | Nightly 03:00 UTC | `pg_dump` → GCS bucket |
| `hamafx-backup-journal` | Nightly 03:05 UTC | Export journal entries → GCS |
| `hamafx-verify-restore` | Sunday 04:00 UTC | Restore latest GCS backup into a throwaway Docker Postgres, verify row counts and schema integrity |

Each backup unit pings its own healthchecks.io UUID.

## Environment

File: `apps/worker/src/env.ts` (116 lines)

The worker uses its own Zod schema (`WorkerEnvSchema`) — deliberately separate from the web's `parseServerEnv` in `@hamafx/shared`. The worker doesn't need `APP_PASSWORD`, `AUTH_COOKIE_SECRET`, or `NEXT_PUBLIC_*` variables. Validating a smaller surface keeps boot fast and failure modes clear.

### Empty-string handling

systemd's `EnvironmentFile=` loads `KEY=` as the literal empty string. Zod's `.optional()` only short-circuits on `undefined`. The worker pre-processes all optional-string fields via `coerceEmptyToUndefined` so blank lines in `/opt/hamafx/.env` don't trip `.min(1)` checks.

### Required variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Production only | Or `POSTGRES_URL`. Both validated as `z.string().url()`. PGlite allowed in dev. |
| `NODE_ENV` | No (defaults to `development`) | `'development' | 'test' | 'production'` |

### Optional variables

| Variable | Default | Notes |
|---|---|---|
| `BIQUOTE_HUB_URL` | `https://biquote.io/hubs/tick` | SignalR hub endpoint |
| `BIQUOTE_BASE_URL` | `undefined` | Override for REST API base |
| `HC_SIGNALR_UUID` | `undefined` | healthchecks.io UUID for SignalR liveness |
| `HC_UPDATE_UUID` | `undefined` | healthchecks.io UUID for self-update |
| `HC_BACKUP_DB_UUID` | `undefined` | healthchecks.io UUID for DB backups |
| `HC_BACKUP_JOURNAL_UUID` | `undefined` | healthchecks.io UUID for journal backups |
| `HC_VERIFY_RESTORE_UUID` | `undefined` | healthchecks.io UUID for restore rehearsal |
| `HC_JOB_BRIEFINGS_UUID` | `undefined` | Per-job healthcheck UUID |
| `HC_JOB_SNAPSHOTS_UUID` | `undefined` | Per-job healthcheck UUID |
| `HC_JOB_COT_UUID` | `undefined` | Per-job healthcheck UUID |
| `HC_JOB_FRED_ACTUALS_UUID` | `undefined` | Per-job healthcheck UUID |
| `HC_JOB_WEEKLY_REVIEW_UUID` | `undefined` | Per-job healthcheck UUID |
| `HC_JOB_EMBEDDING_BACKFILL_UUID` | `undefined` | Per-job healthcheck UUID |
| `HC_JOB_RESONANCE_SYNC_UUID` | `undefined` | Per-job healthcheck UUID |
| `SENTRY_DSN` | `undefined` | Sentry error reporting (no-op when unset) |
| `DEPLOYED_SHA` | `'unknown'` | Written by `update.sh` to `/opt/hamafx/.deployed-sha` |
| `MT5_BRIDGE_PORT` | `8080` | TCP port for local MT5 bridge (1024–65535) |

## Healthchecks

File: `apps/worker/src/healthchecks.ts` (63 lines)

Dependency-free, fail-closed client for healthchecks.io.

| Function | Behavior |
|---|---|
| `ping(uuid, status, body?)` | Fire-and-forget. No-op when `uuid` is undefined/empty. Network errors are swallowed. |
| `withHeartbeat(uuid, fn)` | Wraps async work with start/success/fail pings. Success body = duration in ms; fail body = error message (truncated to 1KB). |

Heartbeat from main worker:
```
Every 30 s:
  ageMs = Date.now() - lastTickAt
  if lastTickAt > 0 AND ageMs < 60_000:
    ping(HC_SIGNALR_UUID, 'success', 'last_tick=1234ms')
  else:
    ping(HC_SIGNALR_UUID, 'fail', 'no_ticks_for=65s')
```

## Source Layout

```
apps/worker/src/
├── index.ts                    # Entry point: main() + runWorker()
├── env.ts                      # WorkerEnvSchema, loadEnv(), resolveDatabaseUrl()
├── log.ts                      # Logger factory (pino)
├── sentry.ts                   # Sentry init + captureException + flush
├── healthchecks.ts             # healthchecks.io client (ping, withHeartbeat)
├── sd-notify.ts                # systemd notification (READY/WATCHDOG/STATUS/STOPPING)
├── mt5-server.ts               # MT5 TCP bridge server
├── signalr/
│   ├── consumer.ts             # SignalRConsumer (hub connection, tick validation)
│   ├── tick-buffer.ts          # TickBuffer (per-symbol latest tick map)
│   └── reconnect.ts            # Reconnect delays + jitter
├── aggregator/
│   └── candle-1m.ts            # Candle1mAggregator (in-process 1m OHLC)
├── persistence/
│   ├── live-ticks.ts           # flushLiveTicks (UPSERT into live_ticks)
│   └── candles-1m.ts           # flushClosedCandle (INSERT into candles_1m)
├── jobs/
│   ├── index.ts                # JOBS registry
│   ├── types.ts                # JobContext, JobResult, JobFn, JobName
│   ├── briefings.ts            # Pre/post-event briefing generation
│   ├── snapshots.ts            # Daily HLOC/pivots/ATR + candles prune
│   ├── cot.ts                  # Weekly CFTC CoT ingestion
│   ├── fred-actuals.ts         # Daily FRED actuals backfill
│   ├── weekly-review.ts        # Sunday weekly review
│   ├── embedding-backfill.ts   # News embedding computation
│   └── resonance-sync.ts       # Intermarket resonance sync
├── runner/
│   └── cli.ts                  # Job runner entry for systemd oneshot units
└── scheduler/
    └── embedded.ts             # node-cron scheduler for local dev mode
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **TickBuffer → 1 Hz flush** | Collapse 200+ ticks/s per symbol into 3 UPSERTs/s. Prevents burning Supabase quota. |
| **MT5 primary, BiQuote fallback** | Local MT5 ticks are lower latency and don't depend on external service. 15 s inactivity window before failing over to BiQuote. |
| **In-process candle aggregation** | No external dependency. Minute-boundary rollover is deterministic. Pure data = testable. |
| **Systemd timers for jobs, not embedded cron** | One job failure can't crash the main consumer. Each job has its own cgroup, memory limit, timeout, and healthcheck. |
| **Job runner CLI as separate entry point** | Same codebase, separate process. systemd oneshot units invoke it directly. Each gets its own Sentry service name. |
| **sd_notify via CLI, not native binding** | Avoids pulling in a native module for half a dozen syscalls per minute. `systemd-notify` ships on every systemd host. |
| **Worker-specific env schema** | Smaller surface than the web schema. No `APP_PASSWORD`, `AUTH_COOKIE_SECRET`, `NEXT_PUBLIC_*`. Fails fast on missing required vars. |
| **PGlite in development** | Workers can run locally without a remote database. Embedded Postgres via WASM. |
| **`coerceEmptyToUndefined`** | systemd `EnvironmentFile=` loads `KEY=` as `""`. Pre-processing avoids Zod validation failures from blank lines. |