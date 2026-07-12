# HamaFX-Ai — VM Infrastructure Full Analysis & Implementation Plan

> **Scope:** Google Cloud VM (`hamafx-cron`, GCE `e2-medium`, us-central1-a) — the worker service, systemd timers, self-update pipeline, backup/restore rehearsal, and all supporting scripts.
> **Method:** Full static code analysis of every file in `infra/cron-vm/`, `apps/worker/src/`, `Dockerfile.worker`, `docker-compose.yml`, `.github/workflows/`, and deployment docs.
> **Date:** 2026-07-12
> **Repo HEAD:** `32b75a8`

---

## Executive Summary

The VM infrastructure is well-architected for a personal SaaS deployment — systemd timers replace cron, a self-update timer pulls from main, healthchecks.io monitors every job, backups + restore rehearsals run automatically. However, there are **5 critical security issues**, **8 bugs that cause incorrect behavior**, **12 reliability gaps**, and **numerous optimization/polish opportunities**. This plan details every finding with implementation instructions.

---

## Table of Contents

1. [Security Issues (CRITICAL)](#1-security-issues-critical)
2. [Bugs & Correctness (HIGH)](#2-bugs--correctness-high)
3. [Reliability & Resilience (MEDIUM)](#3-reliability--resilience-medium)
4. [Performance & Optimization (LOW-MEDIUM)](#4-performance--optimization-low-medium)
5. [Operational & Automation Improvements](#5-operational--automation-improvements)
6. [Documentation & Configuration Fixes](#6-documentation--configuration-fixes)
7. [Testing & CI/CD Improvements](#7-testing--cicd-improvements)
8. [Implementation Order & Priority](#8-implementation-order--priority)

---

## 1. Security Issues (CRITICAL)

### S1. Health server + BiQuote proxy exposed to the public internet

**File:** `apps/worker/src/index.ts` (line ~444)
**Severity:** CRITICAL

The health HTTP server binds to `0.0.0.0:8081`, making it accessible from the internet on a GCE VM with a static external IP. Worse, the `/biquote/*` path is an **open reverse proxy** — anyone on the internet can route requests to `biquote.io` through your VM.

```typescript
// CURRENT (vulnerable):
healthServer.listen(8081, '0.0.0.0', () => { ... });

// The proxy endpoint:
if (req.url?.startsWith('/biquote')) {
  const target = `${BIQUOTE_BASE}${rest}`;
  const targetRes = await fetch(target, ...);
  // No auth, no rate limiting, open to the world
}
```

**Fix:**
1. Bind to `127.0.0.1` instead of `0.0.0.0`:
```typescript
healthServer.listen(8081, '127.0.0.1', () => { ... });
```
2. If Vercel needs to reach the BiQuote proxy, use a GCP firewall rule that allows port 8081 only from Vercel's IP ranges, OR add bearer-token auth to the proxy endpoint:
```typescript
const PROXY_TOKEN = process.env.BIQUOTE_PROXY_TOKEN;
if (req.url?.startsWith('/biquote')) {
  const auth = req.headers.authorization;
  if (PROXY_TOKEN && auth !== `Bearer ${PROXY_TOKEN}`) {
    res.writeHead(403); res.end(); return;
  }
  // ... proceed with proxy
}
```
3. Add a GCP firewall rule creation step to `_provision.sh`:
```bash
gcloud compute firewall-rules create hamafx-allow-8081-internal \
  --network default --allow tcp:8081 --source-ranges 127.0.0.1/32 \
  --project hamafx-78845
```

### S2. SQL injection in `delete-tenant.sh` and `export-tenant.sh`

**Files:** `infra/cron-vm/scripts/delete-tenant.sh`, `infra/cron-vm/scripts/export-tenant.sh`
**Severity:** HIGH

User IDs are interpolated directly into SQL strings without parameterization:
```bash
COUNT=$(psql --dbname="$DB_URL" -A -t -c \
  "SELECT COUNT(*) FROM ${TABLE} WHERE user_id = '${USER_ID}';")
```

If `USER_ID` contains a single quote (e.g., `O'Brien`), the SQL breaks. In the delete script, this could be exploited to inject `DELETE` or `DROP` statements.

**Fix:** Use `psql` variables with proper quoting:
```bash
psql --dbname="$DB_URL" -A -t -v user_id="$USER_ID" -c \
  "SELECT COUNT(*) FROM ${TABLE} WHERE user_id = :'user_id';"
```
The `:'user_id'` syntax tells psql to treat the variable as a properly-quoted string literal. Apply this to all SQL statements in both scripts.

Also validate the `USER_ID` format at the top of each script:
```bash
if [[ ! "$USER_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Invalid user_id format" >&2
  exit 1
fi
```

### S3. Light cron systemd services run as root without hardening

**Files:** `infra/cron-vm/units/hamafx-light-*.service` (news, calendar, alerts, warm-cache, cleanup-uploads)
**Severity:** MEDIUM-HIGH

All light cron services lack `User=`, `NoNewPrivileges=`, `PrivateTmp=`, `ProtectSystem=`, etc. They run as root with full privileges. If `curl` is somehow exploited (e.g., SSRF via a manipulated URL), the attacker has root access.

**Fix:** Add to each `hamafx-light-*.service`:
```ini
[Service]
Type=oneshot
User=hamafx
Group=hamafx
EnvironmentFile=/opt/hamafx/.env
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/hamafx
```
Note: `curl` needs to be accessible to the `hamafx` user (it is — it's in `/usr/bin/`).

### S4. MT5 bridge server has no authentication

**File:** `apps/worker/src/mt5-server.ts`
**Severity:** LOW (loopback only, but defense-in-depth)

The MT5 TCP server on `127.0.0.1:8080` accepts unauthenticated connections. Any local process can inject fake ticks.

**Fix:** Add a simple shared-secret handshake:
```typescript
// First message must be: { "auth": "<MT5_BRIDGE_SECRET>" }
// Before auth, reject all other messages
```
Or at minimum, document that this is intentional for a single-user VM and add a comment.

### S5. No GCP firewall rules documented or configured

**Files:** `infra/cron-vm/_provision.sh`, `infra/cron-vm/README.md`
**Severity:** MEDIUM

The VM has a static external IP but no firewall configuration is documented. By default, GCE blocks incoming traffic, but this should be explicit.

**Fix:** Add to `_provision.sh`:
```bash
log 'ensuring GCP firewall rules (SSH only)'
gcloud compute firewall-rules describe hamafx-allow-ssh --project=hamafx-78845 2>/dev/null || \
  gcloud compute firewall-rules create hamafx-allow-ssh \
    --network default --allow tcp:22 --source-ranges 0.0.0.0/0 \
    --project hamafx-78845
```
Document in README that port 8081 should NOT be exposed externally.

---

## 2. Bugs & Correctness (HIGH)

### B1. `SymbolManager` computes `added`/`removed` for BiQuote and Binance events AFTER updating `this.symbols`

**File:** `apps/worker/src/symbol-manager.ts` (lines ~130-155)
**Severity:** HIGH — subscription updates never fire for BiQuote/Binance

```typescript
this.symbols = newSymbols;  // ← updated HERE

// ... then computes prevBiquote from this.symbols (which is ALREADY newSymbols):
const prevBiquote = Array.from(this.symbols).filter(...);
// added and removed are ALWAYS empty arrays
```

The `symbolsChanged` event computes diffs correctly (before the assignment), but `biquoteChanged` and `binanceChanged` compute diffs from the already-updated set.

**Fix:** Capture the old set before updating:
```typescript
const oldSymbols = new Set(this.symbols);  // ← capture BEFORE
this.symbols = newSymbols;

// Then use oldSymbols for diffing:
const prevBiquote = Array.from(oldSymbols).filter(
  (s) => symbolCategory(s) === 'forex' || symbolCategory(s) === 'gold',
);
```
Apply the same fix for `prevBinance`.

### B2. `Candle1mAggregator` hardcodes `source: 'biquote-signalr'` for all closed candles

**File:** `apps/worker/src/aggregator/candle-1m.ts` (line ~115)
**Severity:** MEDIUM — incorrect source attribution in DB

```typescript
private emitClosed(symbol: Symbol, bar: OpenBar): void {
  this.onClosed({
    // ...
    source: 'biquote-signalr',  // ← hardcoded, even for Binance/TwelveData/MT5 ticks
  });
}
```

Candles from Binance, TwelveData, or MT5 are all labeled as `biquote-signalr` in the `candles_1m` table.

**Fix:** Track the source of the last tick in the open bar:
```typescript
interface OpenBar {
  bucket: number;
  o: number;
  h: number;
  l: number;
  c: number;
  ticks: number;
  source: NormalizedTick['source'];  // ← add this
}

// In openBar():
private openBar(bucket: number, mid: number, source: NormalizedTick['source']): OpenBar {
  return { bucket, o: mid, h: mid, l: mid, c: mid, ticks: 1, source };
}

// In feed():
this.bars.set(tick.symbol, this.openBar(bucket, tick.mid, tick.source));

// In emitClosed():
source: bar.source,
```

Also update `ClosedCandle.source` type from `'biquote-signalr'` to `NormalizedTick['source']`.

### B3. Docker-mode scheduler has different schedules than systemd timers

**File:** `apps/worker/src/scheduler.ts` vs `infra/cron-vm/units/hamafx-job-*.timer`
**Severity:** MEDIUM — Docker and systemd modes behave differently

| Job | systemd timer | scheduler.ts (Docker) | embedded.ts |
|-----|--------------|----------------------|-------------|
| snapshots | 00:05 UTC | 00:00 UTC | 00:05 UTC |
| cot | Fri 22:00 UTC | Sat 00:00 UTC | Fri 22:00 UTC |
| fred-actuals | 01:30 UTC | 01:00 UTC | 01:30 UTC |
| embedding-backfill | every 6h | every 1h | every 6h |

**Fix:** Make `scheduler.ts` match the systemd timers exactly:
```typescript
// Snapshots: Daily at 00:05 UTC
cron.schedule('5 0 * * *', () => void runJobSafely('snapshots', log));

// CoT: Friday 22:00 UTC
cron.schedule('0 22 * * 5', () => void runJobSafely('cot', log));

// FRED Actuals: Daily at 01:30 UTC
cron.schedule('30 1 * * *', () => void runJobSafely('fred-actuals', log));

// Embedding backfill: Every 6 hours
cron.schedule('0 */6 * * *', () => void runJobSafely('embedding-backfill', log));
```

### B4. `uncaughtException` handler doesn't exit the process

**File:** `apps/worker/src/index.ts` (lines ~399-401)
**Severity:** HIGH — can lead to undefined behavior

```typescript
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { err: String(err) });
  captureException(err, { kind: 'uncaughtException' });
  // ← No process.exit() — Node continues in an undefined state
});
```

Node.js documentation explicitly warns: "Attempting to resume normally after an uncaught exception can lead to undefined behavior."

**Fix:**
```typescript
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { err: String(err) });
  captureException(err, { kind: 'uncaughtException' });
  // Give Sentry 2 seconds to flush, then exit — systemd will restart us
  flushSentry(2_000).finally(() => process.exit(1));
});
```

### B5. `resonance-sync.ts` hardcodes `dxyIndex: 100.0`

**File:** `apps/worker/src/jobs/resonance-sync.ts` (line ~140)
**Severity:** LOW — persisted data is meaningless

```typescript
dxyIndex: 100.0,  // ← always 100.0, makes the column useless
```

**Fix:** Either fetch real DXY data from FRED (series `DTWEXBGS`) or set the column to `null` and document that DXY is computed at query time:
```typescript
dxyIndex: null,  // DXY computed on-the-fly by AI tools
```

### B6. `resolveHcUuid` in `runner/cli.ts` missing `alerts` case

**File:** `apps/worker/src/runner/cli.ts` (lines ~48-63)
**Severity:** LOW (alerts only runs in Docker scheduler, not via CLI)

The `resolveHcUuid` function doesn't handle `'alerts'`. If someone manually runs `node dist/runner/cli.js alerts`, the healthcheck UUID is `undefined` and no ping is sent.

**Fix:** Add the case (and add `HC_JOB_ALERTS_UUID` to `env.ts`):
```typescript
case 'alerts':
  return env.HC_JOB_ALERTS_UUID;
```

### B7. Binance consumer connects to all-market tickers when symbol list is empty

**File:** `apps/worker/src/binance/consumer.ts` (line ~78)
**Severity:** MEDIUM — can flood the worker

```typescript
const url = streams
  ? `${BINANCE_WS_BASE}/stream?streams=${streams}`
  : `${BINANCE_WS_BASE}/ws/!miniTicker@arr`;  // ← ALL tickers if empty
```

If `SymbolManager` removes all crypto symbols, the Binance consumer subscribes to `!miniTicker@arr` which streams every ticker on Binance — hundreds per second.

**Fix:** If no symbols, don't connect at all:
```typescript
private connect(): void {
  if (this.destroyed) return;
  if (this.symbols.length === 0) {
    this.log.info('binance ws skipping — no symbols configured');
    return;
  }
  // ... proceed with normal connect
}
```

### B8. `verify-restore.sh` uses pg15 but `docker-compose.yml` uses pg16

**Files:** `infra/cron-vm/scripts/verify-restore.sh` (line ~75), `docker-compose.yml`
**Severity:** MEDIUM — restore rehearsal doesn't match production DB version

```bash
# verify-restore.sh:
docker run ... pgvector/pgvector:pg15

# docker-compose.yml:
image: pgvector/pgvector:pg16
```

If production uses Supabase's Postgres 16, the restore rehearsal should use pg16.

**Fix:** Change `verify-restore.sh` to use `pgvector/pgvector:pg16` (or make it configurable via env var):
```bash
PG_IMAGE="${VERIFY_RESTORE_PG_IMAGE:-pgvector/pgvector:pg16}"
docker run --rm -d --name "$CONTAINER" ... "$PG_IMAGE"
```

---

## 3. Reliability & Resilience (MEDIUM)

### R1. `hamafx-worker.service` `TimeoutStartSec=30` may be too short

**File:** `infra/cron-vm/units/hamafx-worker.service`
**Severity:** MEDIUM

The worker must connect to SignalR, Binance WS, and TwelveData WS before calling `notifyReady()`. If any connection is slow (DNS, TLS handshake, network latency), 30 seconds may not be enough. systemd kills the worker and restarts it, potentially entering a crash loop.

**Fix:** Increase to 60 seconds:
```ini
TimeoutStartSec=60
```

### R2. No `StartLimitBurst` / `StartLimitIntervalSec` on worker service

**File:** `infra/cron-vm/units/hamafx-worker.service`
**Severity:** MEDIUM

If the worker crashes repeatedly on boot (bad config, DB down), systemd restarts it indefinitely with only 5 seconds between attempts. This fills journald with crash logs and potentially exhausts disk space.

**Fix:**
```ini
[Service]
# ... existing config ...
StartLimitIntervalSec=300
StartLimitBurst=10
# After 10 restarts in 5 minutes, systemd stops retrying.
# The update.sh post-deploy guard handles bad deploys; this handles
# boot-loop scenarios that aren't caused by an update.
```

### R3. `update.sh` rollback can silently fail

**File:** `infra/cron-vm/update.sh` (lines ~70-74)
**Severity:** MEDIUM

```bash
rollback() {
  git reset --hard "$PREV_SHA" >/dev/null || true
  pnpm install --frozen-lockfile --silent || true
  pnpm --filter @hamafx/worker build --silent || true
  ping_hc fail "$reason at $NEW_SHA"
  exit 1
}
```

All rollback steps have `|| true`, so if rollback fails, the worker is left in a broken state with no alert beyond the initial fail ping.

**Fix:** Make rollback more robust:
```bash
rollback() {
  local reason="$1"
  log "rolling back to $PREV_SHA: $reason"
  git reset --hard "$PREV_SHA" >/dev/null || {
    log "CRITICAL: git reset failed during rollback — manual intervention required"
    ping_hc fail "ROLLBACK FAILED: git reset failed. reason=$reason"
    exit 1
  }
  if ! pnpm install --frozen-lockfile; then
    log "CRITICAL: pnpm install failed during rollback"
    ping_hc fail "ROLLBACK FAILED: install failed. reason=$reason"
    exit 1
  fi
  if ! pnpm --filter @hamafx/worker build; then
    log "CRITICAL: build failed during rollback"
    ping_hc fail "ROLLBACK FAILED: build failed. reason=$reason"
    exit 1
  fi
  # Restart worker on the rolled-back code
  sudo /bin/systemctl restart hamafx-worker.service || true
  ping_hc fail "rolled back from $NEW_SHA to $PREV_SHA: $reason"
  exit 1
}
```

### R4. `update.sh` runs tests against production database

**File:** `infra/cron-vm/update.sh` (line ~83)
**Severity:** HIGH

```bash
if ! pnpm --filter @hamafx/worker test -- --run; then
  rollback "tests failed"
fi
```

The test suite runs with `DATABASE_URL` pointing to Supabase production. Integration tests might accidentally read/write production data.

**Fix:** Either:
1. Skip tests on the VM (rely on CI) — remove the test step from `update.sh`
2. Or set a test database URL during the test step:
```bash
# Use a separate test DB or mock
DATABASE_URL="" NODE_ENV=test pnpm --filter @hamafx/worker test -- --run
```
Option 1 is recommended — CI already runs tests on every PR and push to main. The VM should only build + restart.

### R5. No disk space monitoring

**Severity:** MEDIUM

The 10GB disk can fill from Docker images (verify-restore), journald logs, or build artifacts. No monitoring or alerting exists.

**Fix:** Add a disk space check systemd timer:
```ini
# infra/cron-vm/units/hamafx-disk-check.service
[Unit]
Description=HamaFX-Ai disk space check
After=network-online.target

[Service]
Type=oneshot
User=hamafx
ExecStart=/bin/sh -c 'df / | awk "NR==2 {if (\$5+0 > 85) exit 1}"'
ExecStartPost=/bin/sh -c 'test -z "$HC_DISK_CHECK_UUID" || /usr/bin/curl -fsS -m 5 "https://hc-ping.com/$HC_DISK_CHECK_UUID/$(df / | awk "NR==2 {print \$5+0 > 85 ? \"fail\" : \"success\"}")" || true'
```

Also add Docker image pruning to `verify-restore.sh`:
```bash
# At the end of cleanup():
docker image prune -f >/dev/null 2>&1 || true
```

### R6. No journald size configuration

**File:** `infra/cron-vm/setup.sh`
**Severity:** LOW-MEDIUM

The `setup.sh` creates a logrotate config for the legacy `/var/log/hamafx-cron.log` but all units now log to journald. Default journald limits might fill the 10GB disk.

**Fix:** Add journald config in `setup.sh`:
```bash
log 'configuring journald storage limits'
cat > /etc/systemd/journald.conf.d/hamafx.conf <<'JOURNALD'
[Journal]
SystemMaxUse=500M
SystemKeepFree=2G
MaxFileSec=7day
JOURNALD
systemctl restart systemd-journald
```

### R7. `backup-db.sh` may use pooled connection for pg_dump

**File:** `infra/cron-vm/scripts/backup-db.sh`
**Severity:** MEDIUM

The fallback chain is `DIRECT_URL` → `POSTGRES_URL_NON_POOLING` → `DATABASE_URL` → `POSTGRES_URL`. If only the pooled URL is set, `pg_dump` through PgBouncer can produce inconsistent dumps or fail.

**Fix:** Warn explicitly if only a pooled URL is available:
```bash
if [[ "$DB_DUMP_URL" == *"pooler"* ]] || [[ "$DB_DUMP_URL" == *"pgbouncer"* ]]; then
  log "WARNING: Using pooled connection for pg_dump — set DIRECT_URL for reliable backups"
fi
```

### R8. `verify-restore.sh` Docker wait loop doesn't exit on failure

**File:** `infra/cron-vm/scripts/verify-restore.sh` (lines ~65-70)
**Severity:** LOW

If the Docker container fails to start (image pull failure, disk full), the 30-second wait loop exits without error and `pg_restore` is attempted against a non-existent database.

**Fix:**
```bash
# After the wait loop:
if ! docker exec "$CONTAINER" pg_isready -U verify >/dev/null 2>&1; then
  log 'postgres container did not become ready in 30 seconds'
  ping_hc fail "postgres container not ready"
  exit 1
fi
```

### R9. `hamafx-worker.service` `TimeoutStopSec=15` may be too short for graceful shutdown

**File:** `infra/cron-vm/units/hamafx-worker.service`
**Severity:** LOW

The shutdown handler drains the tick buffer, closes 4 WebSocket connections, flushes Sentry, and shuts down Langfuse. If the DB is slow, 15 seconds may not be enough.

**Fix:** Increase to 30 seconds:
```ini
TimeoutStopSec=30
```

### R10. `SymbolManager` poll failure leaves stale symbols indefinitely

**File:** `apps/worker/src/symbol-manager.ts`
**Severity:** LOW

If the DB connection is down, the `catch` block logs the error but `this.symbols` remains stale. After the DB recovers, the next poll updates correctly, but during the outage the worker subscribes to symbols that may no longer be needed.

**Fix:** Add a staleness counter and warn after N consecutive failures:
```typescript
private consecutiveFailures = 0;
// In catch block:
this.consecutiveFailures++;
if (this.consecutiveFailures > 5) {
  this.log.warn('SymbolManager: 5+ consecutive poll failures — symbols may be stale');
}
// In success path:
this.consecutiveFailures = 0;
```

### R11. No automatic Docker image cleanup

**File:** `infra/cron-vm/scripts/verify-restore.sh`
**Severity:** LOW

Each weekly verify-restore run pulls `pgvector/pgvector:pg15/16`. Old images aren't pruned, so disk usage grows.

**Fix:** Add to the `cleanup()` function:
```bash
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
```

### R12. `handleIncomingTick` 15-second fallback gap for BiQuote

**File:** `apps/worker/src/index.ts` (lines ~160-170)
**Severity:** LOW (by design, but should be configurable)

When TwelveData disconnects, BiQuote ticks are still dropped for 15 seconds (because `lastTwelveDataTickAt` was set before disconnect). This creates a 15-second data gap.

**Fix:** Make the fallback timeout configurable and reduce to 5 seconds:
```typescript
const FALLBACK_TIMEOUT_MS = Number(process.env.TICK_FALLBACK_TIMEOUT_MS ?? 5_000);
// ...
if (now - lastTwelveDataTickAt < FALLBACK_TIMEOUT_MS) return;
```

---

## 4. Performance & Optimization (LOW-MEDIUM)

### P1. `snapshots.ts` uses `.returning()` for bulk DELETE — returns all deleted rows

**File:** `apps/worker/src/jobs/snapshots.ts` (lines ~75-80)
**Severity:** MEDIUM

```typescript
const result = await getDb()
  .delete(candles1m)
  .where(lt(candles1m.t, cutoff))
  .returning({ symbol: candles1m.symbol });
pruned = result.length;
```

For 14 days of 1m candles across multiple symbols (~56,000+ rows), `.returning()` forces Postgres to return all rows to the Node.js process just to count them.

**Fix:** Use a count query before delete, or use `RETURNING 1`:
```typescript
// Option A: Count before delete
const [{ count }] = await getDb()
  .select({ count: sql<number>`count(*)::int` })
  .from(candles1m)
  .where(lt(candles1m.t, cutoff));
const pruned = count;

await getDb().delete(candles1m).where(lt(candles1m.t, cutoff));

// Option B: Use RETURNING 1 (lighter)
const result = await getDb()
  .delete(candles1m)
  .where(lt(candles1m.t, cutoff))
  .returning({ _: sql`1` });
pruned = result.length;
```

### P2. `briefings.ts` and `weekly-review.ts` fetch all users without pagination

**Files:** `apps/worker/src/jobs/briefings.ts`, `apps/worker/src/jobs/weekly-review.ts`
**Severity:** LOW (single-user SaaS currently)

```typescript
const users = await db.select({ id: schema.users.id }).from(schema.users);
```

For each event, the briefings job loops through every user. With AI calls per user, this can exceed the 120-second timeout.

**Fix:** Add pagination and parallel processing with concurrency limits:
```typescript
const PAGE_SIZE = 50;
let offset = 0;
while (true) {
  const users = await db.select({ id: schema.users.id })
    .from(schema.users).limit(PAGE_SIZE).offset(offset);
  if (users.length === 0) break;
  // Process with limited concurrency...
  offset += PAGE_SIZE;
}
```

### P3. `resonance-sync.ts` writes rows one-by-one instead of batch INSERT

**File:** `apps/worker/src/jobs/resonance-sync.ts` (lines ~150-165)
**Severity:** LOW

```typescript
for (const row of dbRows) {
  await db.insert(schema.intermarketResonance)
    .values(row).onConflictDoUpdate(...);
  processed += 1;
}
```

Each row is a separate round-trip to Postgres. With 45 days of data, that's ~30 queries.

**Fix:** Batch insert with a single query:
```typescript
if (dbRows.length > 0) {
  await db.insert(schema.intermarketResonance)
    .values(dbRows)
    .onConflictDoUpdate({
      target: schema.intermarketResonance.date,
      set: { /* ... */ },
    });
}
processed = dbRows.length;
```

### P4. No `unref()` on timers that don't need to keep the process alive

**File:** `apps/worker/src/index.ts` (flushTimer, heartbeatTimer)
**Severity:** LOW

The flush timer and heartbeat timer keep the process alive even during shutdown. Using `.unref()` on the heartbeat timer (which is best-effort) would allow faster shutdown.

**Fix:** This is optional — the current `stop()` function clears all timers explicitly. But for the heartbeat timer:
```typescript
heartbeatTimer = setInterval(() => { ... }, heartbeatIntervalMs);
heartbeatTimer.unref(); // Don't let this timer prevent shutdown
```

### P5. `_provision.sh` and `setup-worker.sh` are redundant

**Files:** `infra/cron-vm/_provision.sh`, `infra/cron-vm/setup-worker.sh`
**Severity:** LOW (maintenance burden)

Both scripts do essentially the same thing. `_provision.sh` is the newer, more complete version. `setup-worker.sh` is older and doesn't install all systemd units.

**Fix:** Deprecate `setup-worker.sh` by adding a deprecation notice and redirecting to `_provision.sh`:
```bash
#!/usr/bin/env bash
echo "WARNING: setup-worker.sh is deprecated. Use _provision.sh instead." >&2
echo "  sudo bash _provision.sh" >&2
exit 1
```

### P6. `setup.sh` and `_provision.sh` both install the same packages

**Files:** `infra/cron-vm/setup.sh`, `infra/cron-vm/_provision.sh`
**Severity:** LOW (wasted time on re-runs)

`_provision.sh` calls `setup.sh` at the end, but both install `curl`, `postgresql-client`, `docker.io`, etc.

**Fix:** Remove package installation from `setup.sh` since `_provision.sh` already handles it. `setup.sh` should only install systemd units + sudoers + logrotate.

---

## 5. Operational & Automation Improvements

### O1. Add a `/health` endpoint that checks actual worker state

**File:** `apps/worker/src/index.ts`
**Severity:** MEDIUM

The current health endpoint always returns `{ status: 'ok' }` without checking if SignalR is connected or if ticks are flowing.

**Fix:**
```typescript
if (req.url === '/health' || req.url === '/api/health' || req.url === '/') {
  const ageMs = Date.now() - lastTickAt;
  const healthy = lastTickAt > 0 && ageMs < 120_000;
  res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: healthy ? 'ok' : 'degraded',
    lastTickAgeMs: ageMs,
    signalrConnected: consumer.isStarted(),
    uptimeMs: process.uptime() * 1000,
  }));
}
```

### O2. Add a `/jobs/:name/trigger` endpoint for manual job invocation

**File:** `apps/worker/src/index.ts`
**Severity:** LOW (operational convenience)

Currently, to manually trigger a job you must SSH into the VM and run `node dist/runner/cli.js <job-name>`. An HTTP endpoint would be more convenient.

**Fix:** Add to the health server:
```typescript
if (req.url?.match(/^\/jobs\/(\w+)\/trigger$/) && req.method === 'POST') {
  const jobName = req.url.match(/^\/jobs\/(\w+)\/trigger$/)![1];
  if (!isKnownJob(jobName)) {
    res.writeHead(404); res.end(); return;
  }
  // Verify auth
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    res.writeHead(403); res.end(); return;
  }
  // Run job in background
  void JOBS[jobName].run({ log, signal: undefined }).then(...);
  res.writeHead(202); res.end(JSON.stringify({ status: 'accepted', job: jobName }));
}
```

### O3. Add `hamafx-disk-check` systemd timer

**Severity:** MEDIUM

Create a new systemd timer that checks disk space every hour and pings healthchecks.io if usage exceeds 85%.

**Files to create:**
- `infra/cron-vm/units/hamafx-disk-check.service`
- `infra/cron-vm/units/hamafx-disk-check.timer`

(See R5 for the service file content)

### O4. Add `hamafx-docker-prune` systemd timer

**Severity:** LOW

Weekly Docker image/container prune to prevent disk fill from verify-restore runs.

**Files to create:**
- `infra/cron-vm/units/hamafx-docker-prune.service`
- `infra/cron-vm/units/hamafx-docker-prune.timer`

### O5. Add `StartLimitBurst` to all oneshot job services

**Severity:** LOW

If a job fails repeatedly (e.g., API is down), systemd retries on every timer fire. Adding `StartLimitBurst` prevents excessive retries.

**Fix:** Add to each `hamafx-job-*.service`:
```ini
[Service]
# ... existing ...
StartLimitIntervalSec=3600
StartLimitBurst=5
```

### O6. Make the BiQuote proxy URL configurable

**File:** `apps/worker/src/index.ts` (line ~415)
**Severity:** LOW

```typescript
const BIQUOTE_BASE = 'https://biquote.io';  // ← hardcoded
```

**Fix:**
```typescript
const BIQUOTE_BASE = process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
```

This is already in `env.ts` as `BIQUOTE_BASE_URL` but isn't used in the proxy code.

### O7. Add automatic `pnpm store prune` to `update.sh`

**File:** `infra/cron-vm/update.sh`
**Severity:** LOW

The pnpm store grows over time with each update. Add periodic pruning:
```bash
# After successful update:
pnpm store prune 2>/dev/null || true
```

---

## 6. Documentation & Configuration Fixes

### D1. `HC_CLEANUP_UPLOADS_UUID` and `HC_JOB_RESONANCE_SYNC_UUID` missing from RECOVERY.md

**File:** `infra/cron-vm/RECOVERY.md`
**Severity:** LOW

Add these to the UUID table in RECOVERY.md.

### D2. README says `e2-medium` but cost table says `e2-small`

**File:** `infra/cron-vm/README.md`
**Severity:** LOW (cosmetic)

The instance details table says `e2-medium (2 vCPU, 4 GB RAM)` but the title says "A lightweight GCE `e2-small` instance". The cost estimate says `~$15-17` which matches e2-medium, not e2-small (~$13).

**Fix:** Change the intro line to say `e2-medium`.

### D3. Document GCP firewall rules in README

**File:** `infra/cron-vm/README.md`
**Severity:** MEDIUM

Add a "Firewall" section documenting:
- SSH (port 22) allowed from 0.0.0.0/0
- Port 8081 should NOT be exposed externally
- No other inbound ports needed

### D4. Add `HC_JOB_ALERTS_UUID` and `HC_DISK_CHECK_UUID` to `env.ts`

**File:** `apps/worker/src/env.ts`
**Severity:** LOW

Add these to the `WorkerEnvSchema`:
```typescript
HC_JOB_ALERTS_UUID: optionalNonEmpty,
HC_DISK_CHECK_UUID: optionalNonEmpty,
HC_TENANT_DELETE_UUID: optionalNonEmpty,
HC_TENANT_EXPORT_UUID: optionalNonEmpty,
```

### D5. Document the 15-second tick fallback behavior

**File:** `apps/worker/src/index.ts`
**Severity:** LOW

Add a comment block explaining the priority logic and the 15-second fallback gap.

### D6. Update `log.txt` is empty — remove or document

**File:** `log.txt`
**Severity:** LOW (cosmetic)

The file is empty and committed. Remove it or add to `.gitignore`.

---

## 7. Testing & CI/CD Improvements

### T1. Add tests for `SymbolManager` diff logic

**Severity:** MEDIUM

The bug in B1 (incorrect `added`/`removed` for BiQuote/Binance events) would have been caught by a test that verifies the diff arrays are non-empty when symbols change.

**Fix:** Add test file `apps/worker/test/symbol-manager.test.ts` that:
1. Starts with symbols A, B, C
2. Changes to B, C, D
3. Asserts `biquoteChanged` event has correct `added: [D]` and `removed: [A]`

### T2. Add test for `Candle1mAggregator` source tracking

**Severity:** LOW

Test that closed candles have the correct `source` field matching the tick source.

### T3. Add test for Binance consumer with empty symbol list

**Severity:** LOW

Test that `BinanceStreamConsumer` does not connect when `symbols` is empty.

### T4. Add integration test for `update.sh` rollback path

**Severity:** LOW

Test that `update.sh` correctly rolls back when the build fails, and that the worker is restarted on the previous SHA.

### T5. Run worker tests with `NODE_ENV=test` and no `DATABASE_URL`

**Severity:** MEDIUM

Ensure tests never accidentally connect to a production database. Add to `vitest.config.ts` or the test setup:
```typescript
process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
```

---

## 8. Implementation Order & Priority

### Phase 1: Critical Security (do first)
1. **S1** — Bind health server to `127.0.0.1` + add proxy auth
2. **S2** — Fix SQL injection in delete/export tenant scripts
3. **S3** — Add hardening to light cron systemd services
4. **S5** — Document and configure GCP firewall rules
5. **B4** — Fix `uncaughtException` handler to exit process

### Phase 2: Bug Fixes (do second)
6. **B1** — Fix `SymbolManager` diff computation for BiQuote/Binance events
7. **B2** — Fix `Candle1mAggregator` source attribution
8. **B3** — Align Docker scheduler with systemd timer schedules
9. **B7** — Fix Binance consumer empty-symbols flood
10. **B8** — Fix verify-restore pg version mismatch

### Phase 3: Reliability (do third)
11. **R1** — Increase `TimeoutStartSec` to 60s
12. **R2** — Add `StartLimitBurst` to worker service
13. **R3** — Make `update.sh` rollback robust
14. **R4** — Remove test step from `update.sh` (or use test DB)
15. **R5** — Add disk space monitoring
16. **R6** — Configure journald storage limits
17. **R8** — Fix verify-restore Docker wait loop
18. **R9** — Increase `TimeoutStopSec` to 30s

### Phase 4: Performance & Polish
19. **P1** — Fix `snapshots.ts` bulk DELETE returning
20. **P3** — Batch INSERT in `resonance-sync.ts`
21. **O1** — Improve health endpoint with real state
22. **O3** — Add disk-check systemd timer
23. **O4** — Add Docker prune timer
24. **R11** — Add Docker image pruning to verify-restore
25. **R12** — Make tick fallback timeout configurable

### Phase 5: Documentation & Testing
26. **D1-D6** — All documentation fixes
27. **T1-T5** — All test improvements
28. **P5-P6** — Remove redundant scripts
29. **B5** — Fix DXY placeholder in resonance-sync
30. **B6** — Add alerts case to `resolveHcUuid`

---

## Appendix: Files to Modify

| File | Changes |
|------|---------|
| `apps/worker/src/index.ts` | S1 (bind 127.0.0.1), B4 (exit on uncaught), O1 (health endpoint), O2 (job trigger), O6 (proxy URL), R12 (fallback timeout) |
| `apps/worker/src/symbol-manager.ts` | B1 (fix diff computation), R10 (staleness counter) |
| `apps/worker/src/aggregator/candle-1m.ts` | B2 (source tracking) |
| `apps/worker/src/binance/consumer.ts` | B7 (empty symbols guard) |
| `apps/worker/src/scheduler.ts` | B3 (align schedules) |
| `apps/worker/src/runner/cli.ts` | B6 (add alerts case) |
| `apps/worker/src/env.ts` | D4 (add missing UUIDs) |
| `apps/worker/src/jobs/resonance-sync.ts` | B5 (DXY fix), P3 (batch insert) |
| `apps/worker/src/jobs/snapshots.ts` | P1 (fix DELETE returning) |
| `apps/worker/src/mt5-server.ts` | S4 (auth, optional) |
| `infra/cron-vm/units/hamafx-worker.service` | R1, R2, R9 |
| `infra/cron-vm/units/hamafx-light-*.service` | S3 (hardening) |
| `infra/cron-vm/units/hamafx-job-*.service` | O5 (StartLimitBurst) |
| `infra/cron-vm/units/hamafx-disk-check.{service,timer}` | R5, O3 (new files) |
| `infra/cron-vm/units/hamafx-docker-prune.{service,timer}` | O4 (new files) |
| `infra/cron-vm/update.sh` | R3, R4, O7 |
| `infra/cron-vm/setup.sh` | R6 (journald config), P6 (remove dupes) |
| `infra/cron-vm/_provision.sh` | S5 (firewall rules) |
| `infra/cron-vm/setup-worker.sh` | P5 (deprecate) |
| `infra/cron-vm/scripts/delete-tenant.sh` | S2 (SQL injection fix) |
| `infra/cron-vm/scripts/export-tenant.sh` | S2 (SQL injection fix) |
| `infra/cron-vm/scripts/verify-restore.sh` | B8 (pg16), R8 (wait loop), R11 (prune) |
| `infra/cron-vm/scripts/backup-db.sh` | R7 (pooled URL warning) |
| `infra/cron-vm/README.md` | D2, D3 |
| `infra/cron-vm/RECOVERY.md` | D1 |
| `log.txt` | D6 (remove) |
| `apps/worker/test/symbol-manager.test.ts` | T1 (new file) |

---

## Appendix: New Files to Create

1. `infra/cron-vm/units/hamafx-disk-check.service` — disk space check service
2. `infra/cron-vm/units/hamafx-disk-check.timer` — hourly disk check timer
3. `infra/cron-vm/units/hamafx-docker-prune.service` — Docker prune service
4. `infra/cron-vm/units/hamafx-docker-prune.timer` — weekly Docker prune timer
5. `apps/worker/test/symbol-manager.test.ts` — SymbolManager diff tests

---

## Appendix: Verification Checklist

After implementation, verify:

- [ ] Health server is NOT accessible from the public internet (`curl http://<VM_EXTERNAL_IP>:8081/health` should fail)
- [ ] BiQuote proxy requires authentication
- [ ] `delete-tenant.sh` with a user ID containing `'` doesn't break SQL
- [ ] Light cron services run as `hamafx` user, not root
- [ ] `SymbolManager` emits correct `added`/`removed` arrays for BiQuote/Binance
- [ ] `Candle1mAggregator` emits correct `source` for Binance/TwelveData/MT5 ticks
- [ ] Docker scheduler schedules match systemd timers
- [ ] `uncaughtException` causes process exit within 2 seconds
- [ ] Binance consumer doesn't connect when symbol list is empty
- [ ] `verify-restore.sh` uses pg16
- [ ] `update.sh` rollback fails loudly if any step fails
- [ ] `update.sh` does NOT run tests against production DB
- [ ] Disk space check timer fires hourly
- [ ] Journald is limited to 500MB
- [ ] Worker `TimeoutStartSec=60`, `TimeoutStopSec=30`
- [ ] `StartLimitBurst=10` on worker service
- [ ] Health endpoint returns 503 when no ticks for 120s
- [ ] All new UUIDs added to `env.ts` and RECOVERY.md
