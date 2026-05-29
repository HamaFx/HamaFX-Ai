# Hardening Phase 2 — Reliability & Concurrency

> **Theme:** Things that work fine on a quiet day but **break under load, during outages, or after long uptime**. Most fixes are a few dozen lines but require careful sequencing because they touch always-on paths.

## Goal

After this phase the system survives:

- A 30-minute BiQuote outage without manual intervention.
- A SignalR connection that exceeds the SDK's auto-reconnect budget.
- 50 concurrent chat turns without DB connection contention.
- A failover decision that **respects** the worker as primary instead of demoting it on first transient error.

## Scope

- 9 issues, all reliability-class.
- Touches the data adapter pipeline, worker bootstrap, and DB pool config.
- May introduce one new infrastructure concept (Postgres-backed throttle counter).

## Out of scope

- Correctness bugs → done in Phase 1.
- UX polish, observability cleanup, performance micro-opts → Phase 3.

## Pre-requisites

- Phase 1 fully shipped and stable for 1 week.
- Ability to monitor Vercel function logs + journald on the worker VM live during deploy.
- Snapshot Supabase before §1 (worker reconnect changes can cause brief tick gaps during deploy).

## Sequencing

```
§1  Worker SignalR manual reconnect + watchdog        (worker only)
§2  Failover priority pinning for live-ticks          (web only)
§3  Live-ticks freshness window (5s + ageMs surfaced) (web + worker contract)
§4  DB pool size raise + connection lifecycle audit   (web only)
§5  Throttle counter → Postgres (optional)            (web only)
§6  Health state → Postgres (optional)                (web only)
§7  Cache SWR rewrite (single layer)                  (web only)
§8  onFinish background work                          (web only, cosmetic)
§9  evaluateAlerts parallelization                    (web only)
```

§1 lands first and stands alone (worker-side). §2 and §3 must land **together** because they negotiate the same contract. §4 is independent. §5/§6 are optional uplifts of in-memory state to Postgres for cross-instance consistency. §7 should land **after** §3 because the cache rewrite needs the new staleness contract. §8/§9 are independent cleanups.

## Estimated effort

- 1 senior engineer · 5-6 working days.
- Total LOC change: ~1100 across ~20 files.
- One small migration (§5/§6 only).

---

## Issues

### 1. Worker SignalR has no manual reconnect after the SDK exhausts auto-retry

**Severity:** Critical  
**Reference:** Review §7  
**Files:** `apps/worker/src/signalr/consumer.ts`, `apps/worker/src/signalr/reconnect.ts`, `apps/worker/src/index.ts`, `infra/cron-vm/units/hamafx-worker.service`

#### Problem

`@microsoft/signalr.HubConnectionBuilder` is configured with `withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])`. After ~47 s of failures it gives up and fires `onclose`. The consumer flips `started = false` and the worker process keeps running with no SignalR connection. Tick ingestion is silently dead until the next deploy or manual restart.

#### Fix

Two layers, defense in depth.

**Layer A — manual reconnect loop with jittered backoff:**

```ts
// apps/worker/src/signalr/consumer.ts
private reconnectTimer: NodeJS.Timeout | null = null;
private reconnectAttempt = 0;

constructor(opts: ConsumerOptions) { ... }

async start(): Promise<void> {
  // existing connect logic ...
  this.connection.onclose((err) => {
    this.opts.log.error('signalr connection closed', { err: err ? String(err) : 'no error' });
    this.started = false;
    if (!this.stopping) this.scheduleReconnect();
  });
}

private scheduleReconnect(): void {
  if (this.reconnectTimer) return;
  this.reconnectAttempt += 1;
  const baseMs = Math.min(60_000, 2_000 * Math.pow(2, this.reconnectAttempt - 1));
  const delay = jitteredDelay(baseMs);
  this.opts.log.warn('signalr scheduling manual rebuild', {
    attempt: this.reconnectAttempt,
    delayMs: Math.round(delay),
  });
  this.reconnectTimer = setTimeout(() => {
    this.reconnectTimer = null;
    void this.rebuild();
  }, delay);
}

private async rebuild(): Promise<void> {
  try {
    await this.start();
    this.reconnectAttempt = 0; // success — reset
  } catch (err) {
    this.opts.log.error('signalr manual rebuild failed', { err: String(err) });
    this.scheduleReconnect();
  }
}

async stop(): Promise<void> {
  this.stopping = true;
  if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  // existing teardown ...
}
```

**Layer B — systemd watchdog:**

1. Update `infra/cron-vm/units/hamafx-worker.service`:
   ```ini
   WatchdogSec=120
   NotifyAccess=main
   Type=notify
   ```
2. In `apps/worker/src/index.ts`, when a tick arrives in `runWorker`'s `onTick`, send `WATCHDOG=1` to systemd:
   ```ts
   import notify from 'sd-notify'; // or sdnotify-ts equivalent; or implement raw via $NOTIFY_SOCKET

   onTick: (tick) => {
     buffer.push(tick);
     aggregator.feed(tick);
     args.onTick?.(tick);
     lastTickAt = Date.now();
     notifyWatchdog(); // throttled internally to once / 30s
   },
   ```
3. If the watchdog times out, systemd kills the process and `Restart=always` brings it back fresh.

#### Acceptance criteria

- Forcibly black-hole BiQuote (e.g. iptables) for 5 minutes. Restore. Confirm:
  - Logs show "scheduling manual rebuild" with growing attempt counter.
  - On restore, ticks resume within 60 s.
  - No `systemctl restart hamafx-worker` was needed.
- Hang the consumer's `onTick` (introduce `await new Promise(r => setTimeout(r, 200_000))`). Watchdog kills the process within 120 s; systemd restarts it.

#### Tests

- `apps/worker/test/signalr-reconnect.test.ts`: drive the consumer with a fake `BuildConnection` that throws on first 2 calls then succeeds. Assert manual rebuild path is taken.

#### Risk / rollback

- Risk: medium. `Type=notify` + watchdog requires careful sd_notify wiring; misconfiguring causes the worker to be killed even when healthy. Test thoroughly on a staging VM.
- Rollback: revert unit file + remove `notifyWatchdog` calls. Keep the manual reconnect loop; it's safe on its own.

---

### 2. Failover health-score demotes `live-ticks` on first transient error

**Severity:** Critical  
**Reference:** Review §8  
**Files:** `packages/data/src/failover.ts`, `packages/data/src/adapters/price.ts`, `packages/data/src/adapters/candles.ts`, `packages/data/src/providers/live-ticks/index.ts`, `packages/data/src/providers/candles-1m/index.ts`

#### Problem

`runWithFailover` reorders attempts by per-provider health score. When `live-ticks` returns "no fresh row" (a normal occurrence during boot or worker restart), it's recorded as a failure. Score drops below biquote's neutral 0.5. From then on, biquote REST is tried first, defeating the entire SignalR pipeline.

#### Fix

Introduce the concept of a **pinned-priority provider** that bypasses health reordering. The live-ticks pseudo-provider also needs to differentiate "I have nothing fresh to offer, try the next" from "I had an error".

**Step 1:** add a `pinned` flag to `ProviderAttempt`:

```ts
export interface ProviderAttempt<T> {
  name: string;
  /** When true, this attempt is always tried in caller-specified position. */
  pinned?: boolean;
  run(): Promise<T>;
}
```

**Step 2:** sort respects pinning:

```ts
export async function runWithFailover<T>(attempts: ProviderAttempt<T>[]): Promise<{ value: T; provider: string }> {
  if (attempts.length === 0) throw new ProviderError('NO_PROVIDER_AVAILABLE', 'none', 'no providers');

  const pinned = attempts.filter((a) => a.pinned);
  const dynamic = attempts.filter((a) => !a.pinned);
  const dynamicScored = dynamic
    .map((a, i) => ({ a, i, score: getScore(a.name) }))
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .map((s) => s.a);
  const ordered = [...pinned, ...dynamicScored];
  // ... rest unchanged
}
```

**Step 3:** introduce a typed sentinel for "no fresh data" that bypasses health recording:

```ts
// packages/data/src/errors.ts
export class ProviderEmptyError extends Error {
  readonly provider: string;
  readonly code = 'PROVIDER_EMPTY' as const;
  constructor(provider: string, message: string) {
    super(message);
    this.provider = provider;
  }
}

// packages/data/src/failover.ts — in catch block:
if (err instanceof ProviderEmptyError) {
  // No-op for health: an empty result is not a failure.
  console.info(`[data] provider ${a.name} returned empty: ${err.message} — trying next`);
  continue;
}
```

**Step 4:** `live-ticks` and `candles-1m` providers throw `ProviderEmptyError` for stale/missing rows; reserve `ProviderError` for actual errors (DB connection failure, etc.).

**Step 5:** mark `live-ticks` and `candles-1m` attempts `pinned: true` in adapters.

#### Acceptance criteria

- Restart the worker (drains `live_ticks` for ~3 s). During that window, `/api/market/price` requests fall through to BiQuote REST. After restart, requests immediately use `live-ticks` again — no permanent demotion.
- Verify with health endpoint: after 100 successful BiQuote calls during a worker outage, the live-ticks score is unchanged at 0.5.

#### Tests

- `packages/data/test/failover-pinned.test.ts`.
- `packages/data/test/provider-empty-error.test.ts`.

#### Risk / rollback

- Risk: low. Behavior is opt-in via `pinned: true`.
- Rollback: revert the `pinned` flag check; default behavior is unchanged.

---

### 3. `live_ticks` 60-second freshness window is too generous

**Severity:** High  
**Reference:** Review §12  
**Files:** `packages/data/src/providers/live-ticks/index.ts`, `packages/data/src/adapters/price.ts`, `apps/web/src/app/api/market/price/route.ts`, `apps/web/src/components/ui/stale-indicator.tsx`, `packages/shared/src/schemas/tick.ts`

#### Problem

Worker flushes at 1 Hz. A row >2s old means flushes are missing. But the price adapter accepts up to 60 s as fresh and surfaces no age info to the UI. A chat tool can quote a 50-second-old price as if it were live.

#### Fix

**Step 1:** lower the threshold to 5 s:

```ts
// packages/data/src/providers/live-ticks/index.ts
const MAX_AGE_MS = 5_000;
```

**Step 2:** surface tick age on the result envelope:

```ts
export interface LiveTickResult {
  price: number;
  provider: string;
  ts: number;
  /** ms since the worker observed the tick. Always >= 0. */
  ageMs: number;
}
```

**Step 3:** thread `ageMs` through `getPriceWithMeta` → API response:

```ts
// apps/web/src/app/api/market/price/route.ts
interface TickWithMeta extends Tick {
  stale: boolean;
  producedAt: number;
  ageMs: number; // NEW
}
```

**Step 4:** UI shows a heavier `<StaleIndicator>` when `ageMs > 2000`:

```tsx
{ageMs > 2000 ? <StaleIndicator severity="warning" /> : null}
{ageMs > 5000 ? <StaleIndicator severity="critical" /> : null}
```

#### Acceptance criteria

- Pause the worker. Within 5 s, `/api/market/price` falls through to BiQuote REST. The UI shows a single subtle stale chip, not a stale price.
- After resume, the chip disappears within one polling cycle.

#### Tests

- Update `packages/data/test/live-ticks-provider.test.ts` for the new `ageMs` field and 5 s threshold.

#### Risk / rollback

- Risk: low. The lower threshold may cause more BiQuote REST calls during a brief worker stall; throttle headroom should absorb it.

---

### 4. Drizzle pool size = 1 serializes concurrent code paths

**Severity:** Critical  
**Reference:** Review §6  
**Files:** `packages/db/src/client.ts`, `packages/db/src/index.ts`, doc updates

#### Problem

```ts
_sql = postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });
```

A chat turn that runs 4 tool calls + 1 budget check + 1 telemetry write + 1 message append serializes over a single connection. Polling (1.5 s × 3 symbols) contends with chat. Streaming UX visibly stutters.

#### Fix

```ts
// packages/db/src/client.ts
_sql = postgres(url, {
  prepare: false,             // Supabase pooler in transaction mode requires this
  max: 5,                      // 5 concurrent statements; matches typical Lambda concurrency
  idle_timeout: 20,            // close idle conns after 20s
  connect_timeout: 10,
  // Backoff so a misconfigured pool doesn't burn into Supabase's 100-conn ceiling.
  max_lifetime: 60 * 30,       // recycle connections every 30 min
});
```

**Audit step:** grep for any code that assumes serialized DB access. None should exist; document if found.

**Worker:** the worker process is long-running with its own pool. Set `max: 3` in worker-side init (it does fewer concurrent queries than the web).

```ts
// apps/worker/src/index.ts — wherever getDb() is initialized
// Pass options or have a worker-specific drizzle init in @hamafx/db
```

If `@hamafx/db` only exports a single `getDb`, add an optional `getDb({ pool: 'web' | 'worker' })` overload OR honor a `DB_POOL_MAX` env var.

#### Acceptance criteria

- Run 50 concurrent `/api/chat` mock requests. p95 streaming latency under 2× p50 (no serialization tail).
- Supabase dashboard shows max concurrent connections per Lambda ≤ 5.

#### Tests

- Load test script (one-off, not in CI): `apps/web/scripts/load-chat.mjs` simulating 20 concurrent turns.

#### Risk / rollback

- Risk: medium. Wrong pool size can exhaust Supabase's 100-conn cap if Vercel scales to 25+ instances. Watch metrics after deploy.
- Rollback: lower `max` back to 1. Trivially.

---

### 5. Per-provider throttle is per-Lambda-instance (cross-instance leak)

**Severity:** High  
**Reference:** Review §15  
**Files:** `packages/data/src/cache/throttle.ts`, new migration

#### Problem

In-memory `buckets` Map. Vercel can spawn many instances. The "10 req/min" cap on BiQuote becomes "10 × N" in practice. Warm-cache cron + chat tools + page hooks together can hit 30+ req/min real load on BiQuote.

#### Fix

Move the counter into Postgres. Tradeoff: one cheap UPSERT per provider call.

**Step 1:** new table:

```sql
-- packages/db/drizzle/0006_throttle.sql
CREATE TABLE provider_throttle (
  provider TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  backoff_until TIMESTAMPTZ
);
```

**Step 2:** atomic reservation:

```ts
// packages/data/src/cache/throttle.ts
export async function tryReserve(provider: string, cfg: ThrottleConfig): Promise<boolean> {
  // Single CTE: roll window, check effective limit, increment.
  const result = await getDb().execute(sql`
    WITH input AS (SELECT now() AS now, ${cfg.windowMs}::int AS window_ms),
         current AS (
           SELECT provider, window_started_at, count, backoff_until
           FROM provider_throttle
           WHERE provider = ${provider}
           FOR UPDATE
         ),
         rolled AS (
           SELECT
             ${provider} AS provider,
             CASE
               WHEN current.window_started_at IS NULL OR
                    EXTRACT(epoch FROM (input.now - current.window_started_at)) * 1000 >= input.window_ms
               THEN input.now
               ELSE current.window_started_at
             END AS window_started_at,
             CASE
               WHEN current.window_started_at IS NULL OR
                    EXTRACT(epoch FROM (input.now - current.window_started_at)) * 1000 >= input.window_ms
               THEN 1
               ELSE current.count + 1
             END AS count,
             current.backoff_until
           FROM input LEFT JOIN current ON true
         ),
         eff AS (
           SELECT
             CASE
               WHEN backoff_until IS NOT NULL AND backoff_until > (SELECT now FROM input)
               THEN GREATEST(1, FLOOR(${cfg.limit}::float * ${cfg.backoffFraction ?? 0.8})::int)
               ELSE ${cfg.limit}::int
             END AS limit
           FROM rolled
         ),
         decision AS (
           SELECT rolled.count <= eff.limit AS allowed FROM rolled, eff
         )
    INSERT INTO provider_throttle (provider, window_started_at, count, backoff_until)
    SELECT rolled.provider, rolled.window_started_at, rolled.count, rolled.backoff_until
    FROM rolled
    WHERE (SELECT allowed FROM decision)
    ON CONFLICT (provider) DO UPDATE
      SET window_started_at = EXCLUDED.window_started_at,
          count = EXCLUDED.count
    RETURNING true AS allowed;
  `);
  return result.length > 0;
}
```

(Polish the SQL; the structure is what matters.)

**Alternative — simpler:** keep in-memory but also write a heartbeat row to Postgres so other instances can read recent rate. Approximate; acceptable for personal mode.

**Recommendation:** atomic Postgres path is small enough and not on the chat hot path. Worth doing once.

#### Acceptance criteria

- Spawn 5 Vercel functions hitting BiQuote concurrently. Total RPS observed at provider matches `THROTTLE.limit / windowMs`, regardless of instance count.

#### Tests

- `packages/data/test/throttle-postgres.test.ts` against a local Postgres or pgmem.

#### Risk / rollback

- Risk: medium. New DB writes on every provider call. If Postgres becomes a bottleneck, the throttle becomes a bottleneck. Benchmark before deploy.
- Rollback: feature flag `THROTTLE_BACKEND=memory|postgres`.

---

### 6. Per-provider health is per-Lambda-instance

**Severity:** High  
**Reference:** Review §16  
**Files:** `packages/data/src/health.ts`, possible migration if persisting

#### Problem

Each Lambda has its own rolling sample window. Failover decisions vary per instance. With #2 fixed (pinning), this matters less, but it still means scoring of biquote vs finnhub flaps.

#### Fix

Two options.

**Option A — accept per-instance, document:** since pinning (§2) handles the live-ticks case, the residual flap is between biquote and finnhub which are both REST and similar latency. Just document that health is best-effort.

**Option B — Postgres-backed:** small `provider_health(provider, ok_count, fail_count, window_started_at)` table with periodic flush. More work.

**Recommendation:** **Option A**. The actual user impact post-§2 is negligible; the work for Option B is not justified for a single-user app.

#### Acceptance criteria

- After §2, no operational symptom from cross-instance health divergence is observable.
- Comment in `health.ts` explicitly documents the per-instance scope and points to the `pinned` mechanism as the production lever.

#### Tests

- Documentation update only.

#### Risk / rollback

- Risk: none.

---

### 7. Cache SWR rewrite — single layer

**Severity:** Critical  
**Reference:** Review §3 + §4  
**Files:** `packages/data/src/cache/memory.ts`, `packages/data/src/cache/nextjs.ts`, `packages/data/src/cache/types.ts`

#### Problem

The current dual-cache architecture (`unstable_cache` primary + `MemoryCache` mirror) has two bugs:

1. `MemoryCache.fetchWithMeta` doesn't apply SWR fallback when the producer is a single-flight in-flight promise.
2. The mirror is only refreshed on cache miss, so during a long stable window the mirror's TTL elapses and SWR fallback fails when actually needed.

#### Fix

Pick **one** cache layer. Recommended: own it in `MemoryCache` and stop using `unstable_cache` for SWR scenarios.

**Step 1:** rewrite `MemoryCache.fetchWithMeta` so the in-flight handler also catches and falls back:

```ts
async fetchWithMeta<T>(
  key: string,
  producer: () => Promise<T>,
  options: CacheFetchOptions,
): Promise<{ value: T; meta: CacheEntryMeta }> {
  const now = Date.now();
  const ttlMs = options.ttlSeconds * 1000;
  const swrMs = (options.maxStaleSeconds ?? 0) * 1000;
  const tags = options.tags ?? [];

  const hit = this.store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return { value: hit.value, meta: { producedAt: hit.producedAt, stale: false } };
  }

  const existing = this.inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    try {
      const value = await existing;
      const fresh = this.store.get(key) as Entry<T> | undefined;
      const producedAt = fresh?.producedAt ?? Date.now();
      return { value, meta: { producedAt, stale: false } };
    } catch (err) {
      // Inflight callers also get the SWR fallback when a stale value exists.
      if (hit && swrMs > 0 && hit.hardExpiresAt > now) {
        return { value: hit.value, meta: { producedAt: hit.producedAt, stale: true } };
      }
      throw err;
    }
  }

  // ... rest of the existing logic, unchanged
}
```

**Step 2:** make `nextjsCache` defer SWR to `MemoryCache`. Use `unstable_cache` only as an **optional shared cache** for fast cross-instance reads, but treat MemoryCache as the source of truth for staleness:

```ts
class NextjsCache implements Cache {
  private readonly fallback = new MemoryCache();

  async fetchWithMeta<T>(...): Promise<...> {
    // 1. Try MemoryCache first (covers SWR + single-flight cleanly).
    // 2. On the producer call inside MemoryCache, optionally write to unstable_cache via tag.
    // 3. Drop the dual-mirror path entirely.
    return this.fallback.fetchWithMeta(key, async () => {
      // Run producer; record into unstable_cache tag space for cross-instance reuse.
      const value = await producer();
      // Optional: warmCrossInstance(key, value, options.ttlSeconds);
      return value;
    }, options);
  }
}
```

This is a **simplification**: we lose cross-instance cache reuse. With pricing data this is acceptable because the data is so short-lived; the throttle (§5) is what protects the upstream. For longer-lived data (calendar, news), a separate adapter can opt back into `unstable_cache` directly.

#### Acceptance criteria

- Pause BiQuote for 30 minutes. The price adapter serves the last fresh value for `maxStaleSeconds` and then errors. The UI shows the stale chip throughout.
- Run 100 concurrent `getPrice('XAUUSD')` calls during a producer error. All callers see the same stale value (single-flight); no caller errors out spuriously.

#### Tests

- `packages/data/test/cache-swr-inflight.test.ts`: simulate concurrent callers + producer rejection. Assert all receive the cached value.

#### Risk / rollback

- Risk: medium. We lose cross-instance cache reuse for a minute or two between Lambda cold starts. Each instance does its own first fetch.
- Rollback: revert to dual-mirror. Tests added in this fix should still pass.

---

### 8. `streamText.onFinish` does multi-second blocking work

**Severity:** High  
**Reference:** Review §9  
**Files:** `packages/ai/src/agent.ts`

#### Problem

The `onFinish` handler does (sequentially): citation enforcement, `appendAssistantMessage`, `recordTelemetry`, then on first turn: `getThread`, `listMessages(50)`, `generateTitle` (1-3 s LLM), `updateThreadTitle`, more telemetry. The HTTP response stays open until this completes. The user sees the loading dots persist after the last token.

#### Fix

Split fast (must persist before stream close) and slow (background) work.

```ts
// packages/ai/src/agent.ts
onFinish: async ({ usage, finishReason, response }) => {
  // -------- FAST: persist what's needed for correctness, immediately --------
  let messageId: string | null = null;
  try {
    // ... existing assistant message + telemetry persistence (keep)
  } catch (err) {
    console.error('[ai] persistence failed', err);
  }

  // -------- SLOW: don't block the stream close --------
  void runBackgroundFinish({
    threadId,
    messageId,
    env,
    signal: signal ?? undefined,
  }).catch((err) => console.error('[ai] background finish failed', err));
},

async function runBackgroundFinish(args: { ... }) {
  // Auto-title only if first turn
  const thread = await getThread(args.threadId);
  if (thread && thread.title === null) {
    const all = await listMessages(args.threadId, 50);
    // ... existing generateTitle logic
  }
}
```

**Important caveat:** `void`-fired promises in serverless functions can be killed when the function instance is recycled. Vercel's behavior here is "your function may run for up to `maxDuration` even after the response is sent if `await` chains are still in flight." Use `waitUntil` (Vercel native) when available:

```ts
import { waitUntil } from '@vercel/functions';
// ...
waitUntil(runBackgroundFinish({...}));
```

#### Acceptance criteria

- First turn of a new thread: streaming dots disappear within 100 ms of last token. The title appears in the sidebar within 3 s after that (via the existing polling `useEffect`).
- No regression in title quality (LLM call still runs).

#### Tests

- Manual smoke. No good unit test for streaming UX timing.

#### Risk / rollback

- Risk: low. Worst case is a missed title if the function was recycled mid-background work. The deterministic fallback covers this.

---

### 9. `evaluateAlerts` is sequential and may time out

**Severity:** Medium  
**Reference:** Review §35  
**Files:** `packages/ai/src/alerts/evaluator.ts`, `apps/web/src/app/api/cron/alerts/route.ts`

#### Problem

```ts
for (const alert of alerts) { await readRule(alert.rule); ... }
```

N alerts × 50-300 ms each. With 30 alerts and the cron's `maxDuration=60`, you regularly time out. `getCandles` is cached so the wall time doesn't grow linearly with alerts on the same `(symbol, tf)`, but the sequential await still hurts.

#### Fix

Group alerts by `(symbol, tf)` and process groups in parallel. Within a group, share the candle fetch.

```ts
// packages/ai/src/alerts/evaluator.ts
async function readReadingsBatch(alerts: Alert[]): Promise<Map<string, RuleReading | null>> {
  // Pre-fetch unique (symbol) + (symbol, tf) combos in parallel.
  const priceSymbols = new Set<Symbol>();
  const candleKeys = new Map<string, { symbol: Symbol; tf: Timeframe; count: number }>();
  for (const a of alerts) {
    if (a.rule.type === 'priceCross') priceSymbols.add(a.rule.symbol);
    else {
      const k = `${a.rule.symbol}:${a.rule.tf}`;
      candleKeys.set(k, { symbol: a.rule.symbol, tf: a.rule.tf, count: 250 });
    }
  }
  // Parallel fetch
  const [prices, candleArrays] = await Promise.all([
    Promise.all([...priceSymbols].map(async (s) => [s, await getPrice(s)] as const)),
    Promise.all([...candleKeys.values()].map(async (k) => [`${k.symbol}:${k.tf}`, await getCandles(k.symbol, k.tf, { count: k.count })] as const)),
  ]);
  // Compose readings ...
}
```

Then iterate alerts and read from the prefetched data.

#### Acceptance criteria

- 30 alerts evenly distributed across (3 symbols, 5 tfs) complete in < 5 s instead of 15-25 s.

#### Tests

- `packages/ai/test/alerts-evaluator-parallel.test.ts`.

#### Risk / rollback

- Risk: low. Parallelization is straightforward.

---

## Verification plan (whole phase)

1. `pnpm turbo run typecheck` clean.
2. `pnpm turbo run test` clean.
3. `pnpm --filter ai eval -- --cases` clean.
4. Manual chaos checklist:
   - Black-hole BiQuote for 5 min while polling. Recovery within 60 s. (§1, §3, §7)
   - Stop the worker for 30 s. Resume. No permanent demotion. (§2)
   - 50 concurrent `/api/chat` requests. p95 streaming latency reasonable. (§4)
   - 30 alerts. Cron completes within 10 s. (§9)
   - Send first chat turn. Streaming dots disappear under 100 ms after last token. (§8)
5. Watch Vercel logs + journald for any new error patterns over 48 h.

## Rollout

- One PR per logical group:
  - PR-A: §1 (worker reconnect + watchdog).
  - PR-B: §2 + §3 (failover priority + freshness contract).
  - PR-C: §4 (DB pool).
  - PR-D: §5 (Postgres throttle) + §6 (doc-only).
  - PR-E: §7 (cache rewrite).
  - PR-F: §8 (background finish).
  - PR-G: §9 (alerts parallelism).
- Deploy each, watch metrics for 24 h, then move to the next.
- §1 deploy must include a manual `systemctl restart hamafx-worker` run.

## Definition of done

- [ ] All 9 acceptance criteria pass.
- [ ] Manual chaos checklist runs green twice in a row.
- [ ] Sentry has no new error class for 1 week post-deploy.
- [ ] `docs/01-architecture.md` updated to reflect the new failover semantics + worker reconnect + cache simplification.
