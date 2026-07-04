# 05 — Worker Infrastructure Reliability Review

> **Audit scope:** `apps/worker` (full), `infra/cron-vm` (setup script, systemd unit files, update.sh, README, RECOVERY.md), `docs/01-architecture.md` (REST-fallback sequence), `docs/08-deployment.md` (if exists).  
> **Method:** Static code analysis of a shallow clone of `HamaFx/HamaFX-Ai` (commit at HEAD of `main`). No live infrastructure was accessed.  
> **Date:** 2026-07-01  
> **Deliverable type:** Implementation-ready handoff prompt for a follow-up agent.

---

## 1. Single Point of Failure Analysis: The One-VM Problem

### What the codebase reveals

The entire live-price pipeline — SignalR consumer, tick buffer, 1m candle aggregator, six heavy systemd-timer jobs, four light cron curls, self-update timer, backup scripts, and verify-restore — runs on a single GCE `e2-medium` instance named `hamafx-cron`. There is **no standby, no MIG, no cross-zone replica**.

#### VM crash / reboot
- **systemd auto-restart:** `hamafx-worker.service` has `Restart=always` with `RestartSec=5`. On a crash, systemd restarts the worker within 5 seconds. The watchdog (`WatchdogSec=120`) is paired with `Type=notify` — the worker calls `notifyReady()` only after the SignalR connection is established, so systemd waits for a genuine ready signal before marking the unit `active (running)`.
- **Job timers:** All six heavy-job `.timer` units have `Persistent=true` (except embedding-backfill). If the VM is down when a timer fires, systemd catches up on the next boot. The `acquireCronLock` idempotency guard (`INSERT ... ON CONFLICT DO NOTHING` on `cron_runs`) ensures at-most-once per calendar day regardless of catch-up triggers.
- **SignalR state:** The in-memory `TickBuffer` is lost on crash. The 1m candle aggregator's open bar is lost. On restart, the consumer reconnects to BiQuote and ticks resume. The `live_ticks` table (Postgres) survives — it's the durable snapshot.
- **No automatic re-provisioning:** If the VM itself is unrecoverable (disk failure, host maintenance that doesn't auto-migrate), there is no GCP MIG or instance template to recreate it. RECOVERY.md Scenario 4 provides a manual `gcloud compute instances create` command chain — estimated recovery time: **15–30 minutes** of human-in-the-loop work.

#### Network partition
- **SignalR disconnect:** The consumer's two-layer reconnect (SignalR SDK's `.withAutomaticReconnect()` + manual `scheduleReconnect()` loop) handles this. See §2 below.
- **healthchecks.io:** The heartbeat pings `HC_SIGNALR_UUID` every 30 seconds. A network partition lasting >60 seconds causes `ping(..., 'fail')` because `lastTickAt` won't advance. healthchecks.io alerts after its configured grace period (default 5 minutes, adjustable in the HC dashboard).
- **Backup scripts fail:** `backup-db.sh` and `backup-journal.sh` ping `fail` on network errors. `verify-restore.sh` fails if it can't reach GCS.

#### Bad self-update (git pull pulling broken code)

**This is the most critical finding.** `update.sh` has a rollback mechanism, but it has a **blind spot**:

- **What rolls back:** `pnpm install`, `pnpm build`, and `pnpm test` failures all trigger `rollback()` — hard-reset to `PREV_SHA`, re-install, re-build, ping `fail`.
- **What does NOT roll back:** A commit that passes all three of those steps but then causes the worker to crash at runtime (e.g., a runtime TypeError that only surfaces when the SignalR hub sends a tick, or a DB migration that the test suite didn't cover).
- **The restart sequence:** After successful build+tests, `update.sh` runs `sudo systemctl restart hamafx-worker.service`. If that restart **fails** (systemd reports the unit entered a failed state), the script's `|| rollback` catches it. But if the restart **succeeds** (systemd reports `active (running)`) and the worker crashes 10 seconds later, `update.sh` has already exited 0 and `PREV_SHA` is lost.
- **Recovery path:** `Restart=always` kicks in and restarts the worker, which immediately crashes again on the same bad code → restart loop. The only recovery is manual: SSH in, `systemctl mask hamafx-update.timer`, `git reset --hard <known-good-sha>`, rebuild, restart, unmask. This is documented in RECOVERY.md Scenario 3.
- **No canary / staged rollout:** The VM goes directly from `PREV_SHA` to `NEW_SHA` with zero traffic splitting. There is no way to verify the new code on a subset of symbols or users before full cutover.

**Finding:** The self-update pipeline has a **partial rollback** — it covers install/build/test failures and a failed systemd restart, but it does **not** cover runtime crashes that occur after the service enters `active (running)`. A bad deploy that passes tests but crashes at runtime requires manual intervention.

### Open questions (cannot verify from static code)

1. **Actual VM uptime history:** What is the real-world uptime of `hamafx-cron`? Check GCP dashboard → Compute Engine → VM instances → `hamafx-cron` → "Uptime" or "Availability" metrics. Also check `journalctl -u systemd-hostnamed` for reboot records.
2. **Has a bad self-update ever happened?** Check healthchecks.io for `HC_UPDATE_UUID` fail pings. Check `journalctl -u hamafx-update` for rollback log lines.
3. **Does the VM have a sole-tenancy or live-migration configured?** GCE default is `on-host-maintenance=MIGRATE` for e2 machines, which handles most host-level maintenance without reboot. Verify with `gcloud compute instances describe hamafx-cron --zone=us-central1-a --format='value(scheduling.onHostMaintenance)'`.

---

## 2. SignalR Consumer Resilience

### Reconnect / backoff logic

The consumer implements a **two-layer reconnect strategy**:

**Layer 1 — SignalR SDK automatic reconnect (`.withAutomaticReconnect()`):**
- Delay array: `[0, 2000, 5000, 10000, 30000]` ms (defined in `signalr/reconnect.ts` as `DEFAULT_RECONNECT_DELAYS`).
- The 0 ms first attempt handles transient blips.
- After exhausting the 5-attempt schedule, SignalR fires `onclose` and stops trying.

**Layer 2 — Manual rebuild loop (`scheduleReconnect()` in `signalr/consumer.ts`):**
- On `onclose`, if not stopping, calls `scheduleReconnect()`.
- Exponential backoff: `baseMs = min(60000, 2000 * 2^(attempt-1))` → 2s, 4s, 8s, 16s, 32s, capped at 60s.
- Each delay is jittered ±25% via `jitteredDelay()`.
- On successful reconnect, `reconnectAttempt` resets to 0.
- On failure, schedules the next attempt.
- **Bounded:** Yes, hard-capped at `MAX_REBUILD_BACKOFF_MS = 60_000` ms. It will never exceed a 60-second gap between rebuild attempts.

**Finding:** The backoff is properly bounded and jittered. It will not hammer BiQuote's servers during an outage. The 60-second cap is a reasonable trade-off between responsiveness and server load.

### What happens to `live_ticks` freshness during a reconnect gap

- During a reconnect gap (up to ~60 seconds worst case), no ticks flow into the buffer → no UPSERTs to `live_ticks` → the `ts` column on existing rows stops advancing.
- The Vercel `/api/market/price` route reads `live_ticks` via `fetchLiveTick()` in `packages/data/src/providers/live-ticks/index.ts`, which has `MAX_AGE_MS = 5_000` (5 seconds).
- After 5 seconds without a fresh tick, `fetchLiveTick()` throws `ProviderEmptyError` and the failover logic falls through to the BiQuote REST adapter.
- **Result:** The UI sees stale data for at most 5 seconds before transparently switching to the REST fallback.

### Does the REST fallback path actually kick in correctly?

**Yes, verified against the sequence diagram in `docs/01-architecture.md`:**

The architecture doc (lines 135–158) describes:
```
U → W: GET /api/market/price?symbols=...
W → DB: SELECT mid, ts FROM live_ticks WHERE symbol = ANY(...)
alt ts within freshness window → DB returns ticks
else stale → W → BQ: GET /quote?symbols=...
             BQ → W: ticks
             W → DB: UPSERT (best-effort)
W → U: ticks JSON + asOf
```

The actual code in `packages/data/src/adapters/price.ts` implements exactly this flow:
1. `live-ticks` provider is **pinned first** (`pinned: true`) — always tried first regardless of health score.
2. If it throws `ProviderEmptyError` (stale/missing), `runWithFailover` moves to the next attempt.
3. `biquote` REST adapter is the second attempt.
4. `finnhub` is the third (if API key is configured).
5. The cache layer (`fetchWithMeta`) handles stale-while-error: if all providers fail but a cached value exists within the SWR window, it returns the stale value with `stale: true`.

**Finding:** The REST fallback path is correctly wired and matches the documented architecture. The 5-second freshness threshold (`MAX_AGE_MS`) is aggressive enough that users see near-real-time prices during normal operation but don't get silently stale data.

### Open questions

1. **What is BiQuote's actual reconnect behavior server-side?** Does the SignalR hub close idle connections after a timeout? Does it rate-limit rapid reconnect attempts? The current backoff is conservative, but BiQuote's actual behavior is unknown from static code.
2. **Does the `onreconnected` handler's `subscribe()` call ever race with the server's implicit re-subscription?** SignalR's `@microsoft/signalr` package re-subscribes automatically on reconnect for some hub configurations. The code calls `subscribe()` explicitly in `onreconnected`, which could cause a double-subscribe. SignalR typically handles this gracefully (idempotent subscribe), but it's worth verifying.

---

## 3. Heavy Job Idempotency and Failure Handling

### Common infrastructure

Every heavy job runs as a systemd `Type=oneshot` unit, invoked via `runner/cli.ts`. The runner:
1. Resolves the job's healthchecks.io UUID.
2. Wraps execution in `withHeartbeat(uuid, fn)` — pings `start`, then `success` or `fail`.
3. Installs SIGTERM/SIGINT handlers that abort an `AbortController` threaded into `JobContext.signal`.
4. On exception, pings `fail` a second time (defensive double-ping).

The **idempotency guard** (`cron-lock.ts`):
- `acquireCronLock(jobName, db)` attempts `INSERT INTO cron_runs ... ON CONFLICT (job_name, run_date) DO NOTHING`.
- Returns `null` if a row already exists → caller skips.
- Returns a `{ done(), fail() }` handle to record completion status.
- **Not used for `alerts` and `briefings`** (they run more frequently than daily and are inherently idempotent at the application layer).

### Per-job analysis

#### 1. `embedding-backfill` (every 6 hours)
- **What it does:** Calls `backfillEmbeddings()` from `@hamafx/ai` with `batchSize=32, maxRows=1024`.
- **Mid-run crash:** `backfillEmbeddings` processes rows in batches. If it crashes mid-run, some articles get embeddings, some don't. The next run picks up remaining unembedded articles (query filters for `embedding IS NULL`). **No partial/corrupt state** — embeddings are written per-article.
- **Retry safety:** The `acquireCronLock` guard prevents more than one run per day. But since the timer fires every 6 hours and the lock is per-day, only the first of the 4 daily timer firings actually runs. This means a failed run at 00:00 blocks all retries until the next day. **This is a bug:** if the 00:00 run crashes mid-way, the remaining 3 timer firings skip due to the daily lock, leaving unembedded articles until the next day.
- **Recommendation:** Change the lock granularity to per-6-hours or remove the daily lock for this job (embedding-backfill is already idempotent per-article).

#### 2. `briefings` (every 5 minutes)
- **What it does:** Scans `economic_events` for pre-event (T+30m) and post-event (T-30m) windows, calls `emitPreEvent`/`emitPostEvent` per (user, event).
- **Mid-run crash:** Idempotent at `(eventId, kind)` PK on `briefings_emitted`. Re-running re-emits the same events but the PK constraint silently skips duplicates. **No partial/corrupt state.**
- **Retry safety:** No daily lock (runs every 5 minutes). The 5-minute cadence means a missed run is caught within 5 minutes. Safe.

#### 3. `snapshots` (daily at 00:05 UTC)
- **What it does:** Computes HLOC + pivots + ATR per symbol from 240 1H candles, upserts into `snapshots` at `(symbol, kind, asOf)`. Then prunes `candles_1m` to 14 trailing days.
- **Mid-run crash:** If it crashes mid-loop, some symbols have snapshots, some don't. The upsert is idempotent per symbol. The prune step (`DELETE FROM candles_1m WHERE t < cutoff`) is atomic — if it crashes, the next run's prune catches up. **No partial/corrupt state.**
- **Retry safety:** `Persistent=true` timer + daily lock. A missed run catches up on the next timer fire (next day). The `asOf` date is `previousUtcMidnight()`, so a delayed run still computes the correct day's snapshot.

#### 4. `cot` (weekly Friday 22:00 UTC)
- **What it does:** Fetches 4 weeks of CFTC data per symbol, upserts into `cot_reports` at `(symbol, report_date)`.
- **Mid-run crash:** Per-symbol loop with per-row upsert. If it crashes mid-loop, some symbols have data, some don't. Next run refreshes trailing 4 weeks — self-heals. **No partial/corrupt state.**
- **Retry safety:** `Persistent=true` timer + daily lock. A missed Friday run catches up on Saturday (or whenever the VM comes back). The 4-week refresh window means even a 3-week gap self-heals.

#### 5. `fred-actuals` (daily 01:30 UTC)
- **What it does:** Queries `economic_events` where `actuals_filled_at IS NULL`, fetches FRED observations, calls `patchEventActual()`.
- **Mid-run crash:** Per-event processing. If it crashes, some events get patched, some don't. The query filters for `actuals_filled_at IS NULL`, so the next run picks up remaining unpatched events. **No partial/corrupt state.**
- **Retry safety:** Daily lock. A missed run catches up next day.

#### 6. `weekly-review` (Sunday 18:00 UTC)
- **What it does:** Calls `emitWeeklyReview(userId)` per user. Idempotent at `(weekly_review:<isoWeek>, 'weekly_review')` PK on `briefings_emitted`.
- **Mid-run crash:** Per-user loop. If it crashes, some users get their review, some don't. The PK prevents duplicates on retry. **No partial/corrupt state.**
- **Retry safety:** `Persistent=true` timer + daily lock. A missed Sunday run catches up Monday.

### Summary table

| Job | Idempotent? | Partial state on crash? | Auto-retry safe? | Lock gap issue? |
|---|---|---|---|---|
| embedding-backfill | Per-article | No | **No** — daily lock blocks same-day retry | **Yes** |
| briefings | Per (eventId, kind) | No | Yes (5 min cadence) | No |
| snapshots | Per (symbol, kind, asOf) | No | Yes (next day) | No |
| cot | Per (symbol, report_date) | No | Yes (next day, 4-week window) | No |
| fred-actuals | Per event (actuals_filled_at IS NULL) | No | Yes (next day) | No |
| weekly-review | Per (isoWeek, 'weekly_review') | No | Yes (next day) | No |

**Finding:** All six jobs are idempotent at the row level and leave no partial/corrupt state on crash. However, **`embedding-backfill` has a lock-granularity bug**: the daily `acquireCronLock` combined with a 6-hour timer means a failed run blocks retries for up to 24 hours. Recommend changing to a per-6-hour lock or removing the lock entirely (the job is already idempotent per-article).

---

## 4. healthchecks.io Coverage: RECOVERY.md UUID List vs. Actual Code

### RECOVERY.md claims (lines 188–204)

| Check | Cadence | UUID env var |
|---|---|---|
| SignalR worker (always-on) | 30 s heartbeat | `HC_SIGNALR_UUID` |
| Self-update | every 5 min | `HC_UPDATE_UUID` |
| Light news poll | every 5 min | `HC_LIGHT_NEWS_UUID` |
| Light calendar poll | every 15 min | `HC_LIGHT_CALENDAR_UUID` |
| Light alerts poll | every 5 min | `HC_LIGHT_ALERTS_UUID` |
| Light warm-cache poll | every 2 min | `HC_LIGHT_WARM_CACHE_UUID` |
| embedding-backfill | every 6 h | `HC_JOB_EMBEDDING_BACKFILL_UUID` |
| briefings | every 5 min | `HC_JOB_BRIEFINGS_UUID` |
| snapshots | daily 00:05 UTC | `HC_JOB_SNAPSHOTS_UUID` |
| cot | weekly Fri 22:00 UTC | `HC_JOB_COT_UUID` |
| fred-actuals | daily 01:30 UTC | `HC_JOB_FRED_ACTUALS_UUID` |
| weekly-review | weekly Sun 18:00 UTC | `HC_JOB_WEEKLY_REVIEW_UUID` |
| db backup | daily 03:00 UTC | `HC_BACKUP_DB_UUID` |
| journal backup | daily 03:05 UTC | `HC_BACKUP_JOURNAL_UUID` |
| verify-restore | weekly Sun 04:00 UTC | `HC_VERIFY_RESTORE_UUID` |

### What the code actually pings

**Worker (`index.ts`):**
- `HC_SIGNALR_UUID` — pinged every 30s with `success` (if tick received in last 60s) or `fail` (if no tick). ✅ **Covered.**

**update.sh:**
- `HC_UPDATE_UUID` — pinged `success`/`fail` inline via `ping_hc()`. ✅ **Covered.**

**Light cron units (curl-based, ping in `ExecStartPost`):**
- `HC_LIGHT_NEWS_UUID` — in `hamafx-light-news.service`. ✅ **Covered.**
- `HC_LIGHT_CALENDAR_UUID` — in `hamafx-light-calendar.service`. ✅ **Covered.**
- `HC_LIGHT_ALERTS_UUID` — in `hamafx-light-alerts.service`. ✅ **Covered.**
- `HC_LIGHT_WARM_CACHE_UUID` — in `hamafx-light-warm-cache.service`. ✅ **Covered.**
- `HC_CLEANUP_UPLOADS_UUID` — in `hamafx-light-cleanup-uploads.service`. ⚠️ **Listed in RECOVERY.md?** No — `HC_CLEANUP_UPLOADS_UUID` is not in the RECOVERY.md table. The cleanup-uploads unit exists and pings a UUID, but RECOVERY.md omits it.

**Heavy job runner (`runner/cli.ts`):**
- `HC_JOB_EMBEDDING_BACKFILL_UUID` ✅
- `HC_JOB_BRIEFINGS_UUID` ✅
- `HC_JOB_SNAPSHOTS_UUID` ✅
- `HC_JOB_COT_UUID` ✅
- `HC_JOB_FRED_ACTUALS_UUID` ✅
- `HC_JOB_WEEKLY_REVIEW_UUID` ✅
- `HC_JOB_RESONANCE_SYNC_UUID` — **Defined in `env.ts` and wired in `runner/cli.ts`, but NOT in RECOVERY.md table.** ⚠️

**Backup scripts:**
- `HC_BACKUP_DB_UUID` — in `backup-db.sh`. ✅ **Covered.**
- `HC_BACKUP_JOURNAL_UUID` — in `backup-journal.sh`. ✅ **Covered.**
- `HC_VERIFY_RESTORE_UUID` — in `verify-restore.sh`. ✅ **Covered.**

### Gaps

| Gap | Severity | Detail |
|---|---|---|
| `HC_CLEANUP_UPLOADS_UUID` missing from RECOVERY.md | Low | The cleanup-uploads unit exists and pings, but the DR doc doesn't list it |
| `HC_JOB_RESONANCE_SYNC_UUID` missing from RECOVERY.md | **Medium** | `resonance-sync` is a registered job with its own UUID in `env.ts` and `runner/cli.ts`, but RECOVERY.md doesn't list it. If this job fails silently, there's no documented check to look for |
| No `resonance-sync` systemd timer unit | **High** | There is no `hamafx-job-resonance-sync.service` or `.timer` in `infra/cron-vm/units/`. The job is registered in the codebase and has an HC UUID, but there is no systemd unit to actually schedule it. It only runs via the Docker-mode embedded scheduler (`scheduler/embedded.ts`) or the `scheduler.ts` node-cron path. On the GCE VM (systemd timer mode), **resonance-sync never runs**. |
| No `alerts` systemd timer unit | Medium | The `alerts` job is registered in `JOBS` and has a 1-minute cron schedule in `scheduler.ts`, but there is no `hamafx-job-alerts.service` or `.timer` in the units directory. On the VM, alerts run via the light cron path (`hamafx-light-alerts.service` → curl → Vercel `/api/cron/alerts`), not the heavy job runner. This is architecturally correct (alerts are light), but the dual path is confusing. |

**Finding:** RECOVERY.md is missing two entries (`HC_CLEANUP_UPLOADS_UUID`, `HC_JOB_RESONANCE_SYNC_UUID`). More critically, **`resonance-sync` has no systemd timer unit** — it's registered in the codebase, has an HC UUID, but never actually runs on the VM.

---

## 5. Backup / DR Verification

### Nightly pg_dump + GCS upload flow

**`backup-db.sh`** (runs daily at 03:00 UTC via `hamafx-backup-db.timer`):
1. Sources `/opt/hamafx/.env` via `_load-env.sh`.
2. Validates `DATABASE_URL` and `GCS_BACKUP_BUCKET` are set.
3. Pings `HC_BACKUP_DB_UUID` with `start`.
4. Pipes `pg_dump --format=custom --no-owner --no-privileges` → `gzip --rsyncable` → `gsutil cp - gs://${BUCKET}/db/YYYY-MM-DD.dump.gz`.
5. On success: pings `success` with size and duration.
6. On failure: pings `fail` and exits 1.

**`backup-journal.sh`** (runs daily at 03:05 UTC via `hamafx-backup-journal.timer`):
1. Same env sourcing + validation.
2. Pipes `psql -c "SELECT COALESCE(json_agg(j), '[]'::json) FROM journal_entries j"` → `gsutil cp - gs://${BUCKET}/journal/YYYY-MM-DD.json`.
3. Pings `HC_BACKUP_JOURNAL_UUID` with row count.

**Finding:** Both scripts are well-structured. The streaming pipeline (no `/tmp` staging) avoids disk pressure. The 5-minute offset between DB and journal backups means a crash between 03:00 and 03:05 loses at most the journal export, not the DB dump.

### Weekly verify-restore flow

**`verify-restore.sh`** (runs Sunday 04:00 UTC via `hamafx-verify-restore.timer`):
1. Pulls the latest `db/*.dump.gz` from GCS.
2. Boots a throwaway `postgres:15-alpine` Docker container.
3. Creates `vector` and `pgcrypto` extensions (best-effort, non-fatal if unavailable).
4. Runs `pg_restore` against the local container.
5. Asserts `COUNT(*) > 0` on `journal_entries` and `chat_threads`.
6. On success: pings `HC_VERIFY_RESTORE_UUID` with row counts AND writes `gs://${BUCKET}/verify/last-success.txt`.
7. On failure: pings `fail` and exits 1.

### Does a stale `last-success.txt` genuinely page via healthchecks.io?

**No, not directly.** The chain is:

1. `verify-restore.sh` writes `last-success.txt` to GCS on success.
2. `verify-restore.sh` pings `HC_VERIFY_RESTORE_UUID` on success/fail.
3. If the verify-restore timer fails (or the VM is down), `HC_VERIFY_RESTORE_UUID` stops receiving pings → healthchecks.io alerts after its grace period.

The `last-success.txt` file itself is **not monitored by healthchecks.io**. It's a human-readable artifact for post-mortem inspection ("when was the last successful restore?"). The actual alerting comes from the HC ping.

**Finding:** The alerting chain is correct — if verify-restore stops running, healthchecks.io pages. The `last-success.txt` is a supplementary artifact, not the primary alert mechanism. The architecture doc's claim "If that file goes stale, healthchecks.io pages" is slightly misleading; it's the **missing HC ping** that pages, not the stale file itself.

### Open questions

1. **Has the verify-restore ever actually been tested against a real Supabase restore?** The script tests that the dump is restorable to a local Postgres, but has anyone ever used it to restore the actual Supabase database? This is the difference between "backup is restorable" and "we know how to restore."
2. **What is the actual size of the pg_dump output?** The script sets `MemoryMax=1G` and `TimeoutStartSec=1800` (30 min). If the dump grows beyond ~500 MB compressed, the 1G memory limit on the backup service could cause OOM kills.
3. **Does the `postgres:15-alpine` image have the `vector` extension?** The script notes "vector may not be available in postgres:15-alpine" — if the dump contains vector columns (embeddings), `pg_restore` may fail or skip those columns. This should be verified.

---

## 6. Scale Implications

### Which jobs need to become "per-tenant aware"

Currently, every heavy job operates on **all users** in a single pass:

| Job | Current behavior | Multi-tenant change needed? |
|---|---|---|
| `briefings` | Iterates `SELECT id FROM users`, emits per user | **Already per-user** — just needs to scale the loop |
| `weekly-review` | Same pattern | **Already per-user** |
| `alerts` | Delegates to `evaluateAlerts()` which is per-user internally | **Already per-user** |
| `embedding-backfill` | Global — processes all unembedded articles regardless of user | **No change** — embeddings are article-level, not user-level |
| `snapshots` | Global — computes per symbol, not per user | **No change** — snapshots are symbol-level |
| `cot` | Global — per symbol | **No change** — CFTC data is market-level |
| `fred-actuals` | Global — per economic event | **No change** — economic data is market-level |
| `resonance-sync` | Global — per symbol | **No change** — intermarket data is market-level |

**Finding:** The three user-facing jobs (briefings, weekly-review, alerts) already iterate per-user. They will scale linearly with user count. The remaining jobs operate on symbols/markets and don't need per-tenant awareness.

### Where the e2-medium (2 vCPU, 4 GB RAM) becomes a bottleneck first

**Likely bottleneck order:**

1. **Memory (4 GB total):** The worker is capped at `MemoryMax=1.5G`. Each heavy job has its own cap (1G for embedding-backfill, 2G for verify-restore). With the worker (~1.5G) + one heavy job (~1G) + OS (~500 MB) = ~3G, there's only ~1G headroom. If two heavy jobs fire simultaneously (e.g., snapshots at 00:05 and fred-actuals at 01:30 are safely staggered, but a `Persistent=true` catch-up scenario could overlap), the system hits swap or OOM.

2. **CPU (2 vCPU):** The SignalR consumer is I/O-bound (network + DB writes), not CPU-bound. But `embedding-backfill` makes 32 concurrent AI Gateway calls — each is a network round-trip, but the JSON parsing/validation adds CPU pressure. `briefings` iterates all users × all events, which is O(users × events) — with 100+ users and 5-minute cadence, this becomes CPU-bound.

3. **Postgres connection pool:** The worker uses `WORKER_DB_POOL_MAX` (default 3). Each heavy job also opens its own pool. With 3 concurrent jobs + worker = 12+ connections. Supabase Free tier limits to 15 connections. **This is the hardest ceiling** — exceeding it causes connection failures that cascade into job failures.

4. **Disk (10 GB pd-standard):** The OS + Node + pnpm store + git checkout + logs. With aggressive journal logging and backup scripts writing to `/tmp`, 10 GB could fill. The `candles_1m` prune (14-day retention) keeps the DB from growing unbounded, but the local disk is separate.

**Recommendations for scale:**
- **Short-term:** Increase to `e2-standard-2` (2 vCPU, 8 GB RAM) — doubles memory for ~$25/month more.
- **Medium-term:** Move Postgres connection management to PgBouncer (Supabase already provides a pooler URL, but the worker connects directly). Use a single shared connection pool across all jobs.
- **Long-term:** Split the VM into two roles: (a) always-on SignalR consumer on a small instance (e2-small), (b) heavy job runners on preemptible/spot instances with Cloud Tasks or a job queue.

---

## Research Citations

### systemd service reliability patterns
- [systemd.service(5) man page](https://manpages.debian.org/testing/systemd/systemd.service.5.en.html) — Restart=, WatchdogSec, StartLimitIntervalSec, TimeoutStartSec semantics.
- [Systemd Service Reliability Patterns for Production Linux (DevOpsNess, 2026)](https://www.devopsness.com/blog/systemd-service-reliability-patterns-what-we-changed-after-repeated-restart-loops-2026-03-18) — Practical guidance on combining Restart=on-failure with WatchdogSec, calibrating intervals, and avoiding restart storms.
- [Set up self-healing services with systemd (Red Hat)](https://www.redhat.com/en/blog/systemd-automate-recovery) — WatchdogSec with sd_notify(), readiness gates, and conservative restart backoffs.

### SignalR/WebSocket reconnection strategies
- [ASP.NET Core SignalR .NET client (Microsoft Learn)](https://learn.microsoft.com/en-us/aspnet/core/signalr/dotnet-client?view=aspnetcore-9.0) — `WithAutomaticReconnect()` default delays (0s, 2s, 10s, 30s), custom IRetryPolicy for exponential backoff with jitter.
- [Client Reconnection Strategies for SignalR (The Runtime)](https://the-runtime.dev/articles/client-reconnection-strategies/) — Manual rebuild loop pattern after SDK's automatic reconnect exhausts its attempts.
- [WebSocket Reconnection: State Sync and Recovery Guide (WebSocket.org)](https://websocket.org/guides/reconnection/) — Bounded exponential backoff with jitter, thundering herd prevention.

### Single-VM vs MIG tradeoffs on GCP
- [Choose a Compute Engine deployment strategy (Google Cloud)](https://cloud.google.com/compute/docs/choose-compute-deployment-option) — Standalone VM vs unmanaged group vs stateful MIG vs stateless MIG comparison.
- [About repairing VMs for high availability (Google Cloud)](https://cloud.google.com/compute/docs/instance-groups/about-repair) — MIG autohealing: health-check-based instance recreation, initial delay configuration, cross-zone resilience.
- [Using autohealing for highly available apps (Google Cloud tutorial)](https://cloud.google.com/compute/docs/tutorials/high-availability-autohealing) — Practical MIG autohealing setup with health checks.

### Safe self-updating deployment patterns
- [Deploy to Compute Engine (Cloud Build, Google Cloud)](https://cloud.google.com/build/docs/deploying-builds/deploy-compute-engine) — Blue/green deployment with two MIGs, load balancer traffic split, Terraform `create_before_destroy`.
- [Blue/green Deployments: How They Work, Pros And Cons (Octopus)](https://octopus.com/devops/software-deployments/blue-green-deployment/) — Health-checked promotion, automatic rollback on verification failure.
- [kortix-ai/suna deploy-zero-downtime.sh (GitHub)](https://github.com/kortix-ai/suna/blob/5988523e/scripts/deploy-zero-downtime.sh) — Example of a zero-downtime swap script with health-checked promotion and rollback on failure.

---

## Summary of Findings by Severity

### High
1. **`resonance-sync` has no systemd timer unit** — registered in code, has HC UUID, but never runs on the VM. Only runs in Docker/embedded mode.
2. **Self-update rollback doesn't cover runtime crashes** — a deploy that passes tests but crashes at runtime requires manual SSH intervention.
3. **`embedding-backfill` lock granularity bug** — daily `acquireCronLock` blocks same-day retries on failure. A crash at 00:00 means no retry until next day.

### Medium
4. **RECOVERY.md missing entries** — `HC_CLEANUP_UPLOADS_UUID` and `HC_JOB_RESONANCE_SYNC_UUID` not listed.
5. **No MIG / autohealing** — single VM is a SPOF. Manual recovery takes 15–30 minutes.
6. **Postgres connection ceiling** — Supabase Free tier's 15-connection limit is the hardest scaling bottleneck.

### Low
7. **`last-success.txt` alerting description is slightly misleading** — the HC ping pages, not the stale file.
8. **`postgres:15-alpine` may lack `vector` extension** — verify-restore could silently skip vector columns.
9. **Potential double-subscribe on SignalR reconnect** — `onreconnected` calls `subscribe()` explicitly; SignalR may auto-resubscribe.

### Open Questions (owner must check own dashboards)
1. Actual VM uptime history and live-migration configuration.
2. Has a bad self-update ever happened? Check healthchecks.io fail pings.
3. Has verify-restore ever been tested against a real Supabase restore?
4. Actual pg_dump size and whether it fits within the 1G MemoryMax.
5. Does `postgres:15-alpine` support the `vector` extension?
