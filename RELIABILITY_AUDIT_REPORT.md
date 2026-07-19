# HamaFX-Ai Deep Reliability Audit Report

**Date:** July 19, 2026  
**Scope:** Full codebase — provider failover, database, AI agent, API routes, worker daemon, frontend, shared utilities  
**Auditor:** Automated deep review via file-picker, code-searcher, and manual analysis  

---

## Executive Summary

HamaFX-Ai demonstrates **strong reliability engineering** across all layers. The codebase exhibits mature patterns: structured error classes (`AppError`, `ProviderError`), multi-layer retry with exponential backoff + jitter, health-aware provider failover, idempotent cron jobs, graceful shutdown, systemd watchdog integration, multiple error boundaries, and comprehensive logging.

However, the audit identified **3 critical, 5 high, 7 medium, and 4 low-severity findings** spanning tick data loss during DB failures, fragile error classification, per-instance health scoring divergence, missing retry guards, and several low-risk edge cases.

---

## Findings Summary

| # | Severity | Layer | Finding |
|---|----------|-------|---------|
| C1 | 🔴 Critical | Worker | Tick buffer drains irreversibly before DB write — data loss on flush failure |
| C2 | 🔴 Critical | Worker | Overlapping tick flushes can silently drop ticks when DB is slow |
| C3 | 🔴 Critical | AI Agent | `isTransientByDefault` returns false for `reason: 'unknown'` — retry skipped for silent provider errors |
| H1 | 🟠 High | Data | Health scoring is per-Vercel-instance — stale scores cause routing divergence |
| H2 | 🟠 High | Worker | `acquireCronLock` failure proceeds without idempotency — duplicate job risk |
| H3 | 🟠 High | AI Agent | Context-window overflow regex may miss new provider error formats |
| H4 | 🟠 High | Worker | SignalR `onTick` handler errors silently drop ticks with no retry |
| H5 | 🟠 High | DB | `withDbRetry` uses fragile string-matching on error messages |
| M1 | 🟡 Medium | Shared | `decryptByok` returns null on failure — silent corruption masking |
| M2 | 🟡 Medium | Data | In-process cache has no upper bound on hard-expired entry retention |
| M3 | 🟡 Medium | Worker | Worker flush loop `setInterval` ignores overlap from prior slow flush |
| M4 | 🟡 Medium | AI Agent | No circuit breaker on repeated model failures |
| M5 | 🟡 Medium | Frontend | No retry button on chat stream failure during generation |
| M6 | 🟡 Medium | API | No request timeout for long-running chat API calls |
| M7 | 🟡 Medium | Worker | Job in-flight guard uses in-memory Set — lost on crash/restart |
| L1 | 🔵 Low | Shared | `getEncryptionKey()` throws on missing `ENCRYPTION_SECRET` — no graceful fallback message |
| L2 | 🔵 Low | Frontend | `IntersectionObserver` silently degrades without user feedback |
| L3 | 🔵 Low | API | Health endpoint `checkEnv` hardcodes required vars — no automatic discovery |
| L4 | 🔵 Low | Worker | `notifyWatchdog` throttled to 30s — 120s WatchdogSec only allows 4 missed pings |

---

## 🔴 Critical Findings

### C1 — Tick Buffer Drains Irreversibly Before DB Write (Data Loss)

**File:** `apps/worker/src/persistence/live-ticks.ts`  
**Location:** `flushLiveTicks()` → `args.buffer.drain()`  

**Evidence:** The tick buffer's `drain()` method (in `tick-buffer.ts`) clears the internal `Map` immediately. If the subsequent DB upsert in `flushLiveTicks` fails (e.g. connection error, timeout), the ticks are permanently lost:

```typescript
// tick-buffer.ts — drain() clears all state
drain(): Array<{ tick: NormalizedTick; observed: number }> {
    // ...build output...
    this.slots.clear();   // <-- irreversible
    return out;
}

// live-ticks.ts — no retry if DB insert fails
const drained = args.buffer.drain();
await args.db.insert(liveTicks).values(rows).onConflictDoUpdate(...) // 💥 fails → ticks gone
```

**Impact:** During extended DB outages (Supabase maintenance, pool exhaustion), all ticks received by the worker during the outage window are silently discarded. The `live_ticks` table will have stale data, and the 1m candle aggregator (which feeds from the same `onTick` handler) may also produce incorrect candle closes.

**Recommendation:** Implement a write-ahead buffer pattern: only clear the slot after the DB write confirms. Keep drained ticks in a "pending flush" array until the DB insert succeeds. On failure, re-merge into the buffer or retry on the next interval.

---

### C2 — Overlapping Tick Flushes Can Silently Drop Ticks

**File:** `apps/worker/src/index.ts` (lines ~270-295)  
**Location:** `setInterval` flush loop  

**Evidence:** The flush loop uses `setInterval` at 1-second intervals. If the database is slow (e.g. 1.5s query time), the next interval fires while the previous flush is still running. There is no guard against this overlap:

```typescript
const flushIntervalMs = args.flushIntervalMs ?? 1_000;
const flushTimer = setInterval(() => {
    void (async () => {
        const r = await flushLiveTicks({ db, buffer, log });
        // If this takes > 1s, the next call to drain() runs concurrently
    })();
}, flushIntervalMs);
```

The `TickBuffer.drain()` is not atomic — if two `drain()` calls overlap, the second call returns an empty array (because the first already cleared the slots), and those ticks are silently dropped.

**Impact:** Under DB latency spikes, tick data is silently discarded with no log warning. Combined with C1, this creates a double-loss scenario: ticks lost during slow flushes + ticks lost if the flush fails.

**Recommendation:** Use a `setTimeout`-based self-rescheduling loop (like the `multi-agent-analysis` poll already does). Only schedule the next flush after `flushLiveTicks` resolves:

```typescript
const scheduleFlush = () => {
    setTimeout(() => {
        void flushLiveTicks({ db, buffer, log }).finally(scheduleFlush);
    }, flushIntervalMs);
};
```

---

### C3 — Retry Classification Misses Unknown Provider Errors

**File:** `packages/ai/src/retry.ts` (lines 119-122)  
**Location:** `isTransientByDefault()` depends on `classifyStreamError`  

**Evidence:** The default `isRetryable` check only retries three specific error reasons:

```typescript
function isTransientByDefault(err: unknown): boolean {
    const { reason } = classifyStreamError(err);
    return reason === 'rate-limit' || reason === 'upstream' || reason === 'timeout';
}
```

When `classifyStreamError` cannot classify an error (no status code found, no matching regex), it returns `reason: 'unknown'` with `fallback: false`. This means any provider error that doesn't match the known patterns is treated as **non-retryable** and thrown immediately on the first attempt — even if it was actually transient (e.g. a new HTTP status code 503 from a provider, or an SDK-level network error with a novel message format).

**Impact:** For new provider SDK versions or API changes that introduce new error shapes, transient failures will not be retried and users will experience unnecessary chat failures.

**Recommendation:** Change `isTransientByDefault` to treat `reason: 'unknown'` as retryable on the first retry (attempt 0), since the cost of retrying a non-transient error once is minimal compared to the cost of failing a chat turn unnecessarily. Additionally, log the unclassified error shape to help improve the classifier.

---

## 🟠 High Findings

### H1 — Per-Instance Health Scoring Causes Routing Divergence

**File:** `packages/data/src/health.ts` (lines 79-85)  
**Location:** Comment acknowledges this limitation  

**Evidence:** The health state is an in-memory `Map` per Node.js process. On Vercel, each function instance maintains its own copy. The code acknowledges:

> "A provider that fails on instance A may still look healthy to instance B for a few minutes."

While the comment argues this is acceptable for REST-based providers, the `getScore()` function uses exponential decay on consecutive failures — meaning an instance that sees a burst of failures will route away from the degraded provider, but other instances continue hitting it for up to 5 minutes.

**Impact:** Bursty degradation (e.g. intermittent 503s from BiQuote REST) causes different user experiences across Vercel instances. Some users see fresh data while others get stale-cache responses, creating confusing inconsistency.

**Recommendation:** Implement a shared health store via a lightweight Postgres table with short TTLs (INSERT/UPDATE with 60s expiration), or use the existing `recordSuccess`/`recordFailure` API backed by a DB table. The overhead of a single-row write per failure is negligible compared to the consistency gain.

---

### H2 — Cron Lock Failure Proceeds Without Idempotency (Duplicate Risk)

**File:** `apps/worker/src/scheduler.ts` (lines 214-222)  
**Location:** `runJobSafely()` — lock acquisition catch block  

**Evidence:** When `acquireCronLock` throws (DB unavailable), the scheduler logs a warning and proceeds without any idempotency guard:

```typescript
} catch (lockErr) {
    jobLog.warn('Failed to acquire cron lock, proceeding without idempotency guard', {
        err: String(lockErr),
    });
}
```

This is documented as intentional: "a missed run is worse than a duplicate for most jobs." However, for certain jobs — particularly `snapshots` (daily), `cot` (weekly), and `weekly-review` (weekly) — a duplicate run could insert duplicate data that corrupts analytics. The `snapshots` job in particular performs `snapshot_1d` inserts that may not be fully idempotent.

**Impact:** During a DB outage at the exact moment a daily job is scheduled, duplicate data is inserted when the DB recovers. The cron lock failure also prevents state tracking — the `cron_runs` table never records the run, so the health endpoint won't detect the duplicate.

**Recommendation:** Add job-level idempotency as a fallback. For snapshots: use `ON CONFLICT (symbol, ts, tf) DO NOTHING` in the insert query to prevent duplicate rows even when the cron lock is bypassed. For CoT/weekly-review: add a unique constraint on `(run_date, job_name)` that would make duplicate inserts fail at the DB level rather than silently creating duplicate data.

---

### H3 — Context-Window Overflow Regex Is Fragile

**File:** `packages/ai/src/fallback.ts` (line 52)  
**Location:** `CTX_OVERFLOW_RX` regex pattern  

**Evidence:** The regex used to detect context-window errors is:

```typescript
const CTX_OVERFLOW_RX = /context\s*(length|window|limit|size)|maximum\s*context|reduce\s*the\s*length|too\s*many\s*tokens|max[_-]?tokens|input\s*is\s*too\s*(long|large)|exceeds\s*(the\s*)?(context|limit|maximum)/;
```

This regex has several gaps:
- DeepSeek's error: `"token count exceeds the maximum allowed"` — doesn't match
- Mistral's error: `"the request is too large for the model"` — doesn't match
- xAI/Grok might have its own format
- Regex is case-insensitive but `\s*` patterns don't account for possible line breaks in error strings

**Impact:** When a new provider's context-window error is not detected, `classifyStreamError` returns `fallback: false, reason: 'unknown'`. Combined with C3, this means the retry mechanism won't fire and the fallback logic won't switch to a larger-context model. The user gets a hard failure instead of an automatic fallback.

**Recommendation:** Broaden the regex to catch more patterns (`token.*exceed`, `too.*long`, `too.*large`, `exceed.*limit`). Add a periodic review to the `ERROR_PATTERNS` catalog for new provider error messages. Consider a fallback-on-400-default strategy: if a 400 with `fallback: false` occurs, try fallback anyway as a last resort.

---

### H4 — SignalR `onTick` Handler Errors Silently Drop Ticks

**File:** `apps/worker/src/signalr/consumer.ts` (lines 278-287)  
**Location:** `handleTick()` catch block  

**Evidence:** The `onTick` callback is wrapped in a try/catch that logs and swallows the error:

```typescript
try {
    this.opts.onTick(normalized);
    this.opts.onActivity?.();
} catch (err) {
    this.opts.log.error('onTick handler threw', { err: String(err) });
}
```

While this prevents one bad tick handler from crashing the SignalR connection, it means that if the handler fails due to a transient issue (e.g. memory pressure, GC pause causing an unexpected throw), the tick is silently discarded with no retry. In production, this `onTick` feeds both the `TickBuffer` (for DB persistence) and the `Candle1mAggregator` (for candle building).

**Impact:** A transient exception in the tick handler (e.g. `TypeError` from a null reference during a rapid subscription change) causes tick data loss. If this happens at a key market moment (news event, session open), it could distort candles and price snapshots.

**Recommendation:** At minimum, track a counter of dropped ticks and expose it in the health endpoint. For better resilience, implement a small retry buffer for failed ticks (retry on the next handler invocation before processing new ticks).

---

### H5 — `withDbRetry` Uses Fragile Error Message String Matching

**File:** `packages/db/src/client.ts` (lines 249-273)  
**Location:** `withDbRetry()` retry condition  

**Evidence:** The retry decision is based on `includes()` string matching against error messages:

```typescript
if (
    !msg.includes('connection') &&
    !msg.includes('timeout') &&
    !msg.includes('deadlock') &&
    !msg.includes('serialization') &&
    // ... more patterns ...
) {
    throw err; // non-transient, don't retry
}
```

This approach has multiple fragility points:
- postgres-js may change error message text in a minor version
- Non-English error messages (localized Postgres) won't match
- Error codes (SQLSTATE 40P01 for deadlock, 40001 for serialization) are more reliable than string matching
- The condition uses negation (`!msg.includes`) which could miss retry-worthy errors that don't mention any of these terms (e.g. `"could not receive data from server"`)

**Impact:** A postgres-js update that changes error message phrasing could cause the retry mechanism to fail silently — transient errors would be thrown as unhandled exceptions instead of being retried.

**Recommendation:** Replace string matching with postgres-js error properties. The `postgres` library surfaces `err.code` (SQLSTATE), `err.severity`, and `err.routine`. Check SQLSTATE classes: `08XXX` (connection), `40P01` (deadlock), `40001` (serialization), `57PXX` (admin shutdown). Fall back to string matching only when these structured properties are absent.

---

## 🟡 Medium Findings

### M1 — `decryptByok` Returns Null on Failure (Silent Masking)

**File:** `packages/shared/src/encryption.ts` (lines 97-118)  
**Location:** `decryptByok()`  

**Evidence:** The decryption function returns `null` on any failure — wrong key, corrupted data, auth tag mismatch, or invalid format. This is safe (never crashes) but creates a silent failure mode where:
1. A user's BYOK keys are corrupted in the DB
2. The agent cannot use any user-provided model keys
3. The error is logged nowhere in the decryption path
4. The user sees a generic "no API key configured" message

**Impact:** Hard to debug in production. The error is swallowed with no structured log entry. Could lead to users assuming their keys were never saved.

**Recommendation:** Add a `logErrorContext` call inside the catch block before returning null. Log the category (`system`) and operation (`decrypt_byok`), and consider adding a `decryption_error_count` metric that can trigger alerts.

---

### M2 — In-Process Cache Lacks Hard Bounds on Expired Entries

**File:** `packages/data/src/cache/memory.ts` (lines 138-152)  
**Location:** `lazySweep()` sweeps at most 32-128 entries per call  

**Evidence:** The lazy sweep only removes a bounded number of entries per `fetchWithMeta` call. If entries are being created faster than they're swept (e.g. many unique cache keys from dynamic symbol/timeframe combinations), expired entries accumulate. The periodic sweep (`setInterval` for workers only) runs every 60s, but on Vercel (no periodic sweep), expired entries only get cleaned during `fetch` calls.

**Impact:** On Vercel, a function instance serving many unique cache keys could accumulate thousands of expired entries, wasting memory. In the worst case, this could contribute to function OOM kills.

**Recommendation:** Add an `LRU` eviction on insert that checks `hardExpiresAt` and removes the LRU entry if the store exceeds `maxEntries`, even if the entry hasn't hit `hardExpiresAt`. Add a periodic sweep timer for non-worker runtimes too (set a `setInterval` with `unref()` whenever `fetchWithMeta` is called for the first time).

---

### M3 — Worker Flush Loop Ignores Overlap From Prior Slow Flush

**File:** `apps/worker/src/index.ts` (lines 270-295)  
**Location:** `setInterval` without overlap guard  

**Evidence:** This is closely related to C2 but is rated Medium because `flushLiveTicks` itself is lightweight (3-row UPSERT). However, during DB latency spikes or pool exhaustion, the UPSERT can take multiple seconds. The `setInterval` fires regardless:

```typescript
const flushTimer = setInterval(() => {
    void (async () => {
        const r = await flushLiveTicks({ db, buffer, log });
        // No check: was another flush() already running?
    })();
}, flushIntervalMs);
```

**Impact:** Under sustained DB slowness, multiple `flushLiveTicks` calls run concurrently. While `drain()` itself is fast, the DB insert portion would have 2-3 concurrent UPSERTs on the same rows, wasting DB connections from the already-small pool (3 connections for worker).

**Recommendation:** Same as C2 — switch to a self-rescheduling `setTimeout` pattern. Additionally, add a debounce: if the flush takes longer than the interval, log a warning and skip the next interval.

---

### M4 — No Circuit Breaker on Repeated Model Failures

**File:** `packages/ai/src/model.ts`, `packages/ai/src/fallback.ts`  
**Location:** Model call path  

**Evidence:** The agent retries individual model calls via `withRetry` (3 attempts), but there's no circuit breaker across multiple calls. If a model provider is degraded (e.g. returning 5xx for 30 seconds), the agent will retry every chat turn — wasting retry budget and user time. The `classifyStreamError` fallback does switch providers, but only after the first failure per turn.

**Impact:** During a provider outage, chat turns are slow (each retry adds 500ms–4s of delay) and the fallback model may also be degraded if it's the same provider. Users experience multi-second pauses with no indication that the system is aware of a provider issue.

**Recommendation:** Integrate the failover health scoring from `packages/data/src/health.ts` into the model routing layer. Track per-model error rates and temporarily deprioritize models with high failure rates. Expose a "model health" metric in the admin dashboard.

---

### M5 — No Retry Button on Chat Stream Failure During Generation

**File:** `apps/web/src/app/(app)/chat/error.tsx`  
**Location:** Chat error boundary  

**Evidence:** The chat error boundary (`chat/error.tsx`) only shows a "Retry" button that calls `reset()`, which re-renders the component. It does NOT provide a way to retry the last failed message generation. The chat state (message history) may be preserved in the `useChat` hook, but the UI gives no indication of whether the user can resume the conversation.

**Impact:** When a streaming response fails mid-generation, the user sees a generic error card. Clicking "Retry" reloads the page but doesn't regenerate the failed message. The user has to manually resend their last prompt, potentially losing context if the failed message was in the middle of a multi-turn conversation.

**Recommendation:** Add a "Regenerate response" button in the chat error boundary that re-invokes the last `append` or `reload` call from the `useChat` hook. Pass the `reload` function from `useChat` into the error boundary via context.

---

### M6 — No Request Timeout for Long-Running Chat API Calls

**File:** `apps/web/src/app/api/chat/route.ts`  
**Location:** Chat API route handler  

**Evidence:** The `/api/chat` endpoint streams responses but has no explicit request timeout. On Vercel Hobby, the function timeout is 10s — but the streaming response can keep the connection open beyond that. On Vercel Pro (60s or 300s), a hung model call could consume the entire budget. The route uses `streamText` from the AI SDK but there's no `AbortSignal.timeout()` wrapper around the entire route handler.

**Impact:** A hung model stream (network stall, provider freezing) can consume the entire Vercel function budget, causing a hard 504 for the user. On Pro plans, this wastes significant compute time.

**Recommendation:** Add a hard timeout to the route handler — e.g., `AbortSignal.timeout(55_000)` for Pro, `AbortSignal.timeout(8_000)` for Hobby — that wraps the entire `streamText` call. This ensures the function returns before Vercel kills it, giving the user a clean error response.

---

### M7 — Job In-Flight Guard Uses In-Memory Set (Lost on Crash)

**File:** `apps/worker/src/scheduler.ts` (line 37)  
**Location:** `_runningJobs` Set  

**Evidence:** The in-flight guard prevents overlapping job runs within the same process:

```typescript
const _runningJobs = new Set<keyof typeof JOBS>();
```

This correctly prevents a slow job from being started again by the next cron tick. However, it's purely in-process: if the worker crashes and systemd restarts it, there's no persistent record of what was running. The `cleanupStaleCronRuns` function handles cron_runs rows stuck in 'started', but only after 5 minutes.

**Impact:** For long-running jobs (e.g., `embedding-backfill` which processes hundreds of articles), a crash within 5 minutes of starting means the next run won't clean up the stale cron_runs row for 5 minutes. If the job is scheduled every 6 hours, this is acceptable. But for the `multi-agent-analysis` job (polls every 3 seconds), a crash could leave rows stuck in 'running' state for 5 minutes, blocking those analysis jobs.

**Recommendation:** The `cleanupStaleCronRuns` timeout of 5 minutes is reasonable for most jobs. For `multi-agent-analysis`, add a shorter stale timeout (e.g. 30 seconds) specifically for analysis_jobs rows, since the poll interval is 3 seconds.

---

## 🔵 Low Findings

### L1 — `getEncryptionKey()` Throws Without Graceful Fallback

**File:** `packages/shared/src/encryption.ts` (lines 49-56)  
**Location:** `getEncryptionKey()`  

**Evidence:** When `ENCRYPTION_SECRET` is not set, the function throws an untyped `Error`. This is caught by `decryptByok` which returns null, but if called directly (e.g. `encryptSecret`), it surfaces as an unhandled exception.

**Recommendation:** Throw an `AppError` with code `INTERNAL` instead of a plain `Error`, so the error handling pipeline can properly classify and log it.

---

### L2 — `IntersectionObserver` Degrades Silently Without Feedback

**File:** `apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx` (lines 153-161)  
**Location:** Chart visibility observer  

**Evidence:** When `IntersectionObserver` is not available (very old browsers), the `useEffect` silently skips the observer setup and `visible` stays `true`. While this is a graceful degradation, there's no indication in the UI that the "only fetch when visible" optimization is disabled.

**Recommendation:** This is fine as-is for backward compatibility. No action needed; documented for awareness.

---

### L3 — Health Endpoint `checkEnv` Hardcodes Required Vars

**File:** `apps/web/src/app/api/health/route.ts` (line 108)  
**Location:** `checkEnv()` function  

**Evidence:** The required env vars are hardcoded: `['DATABASE_URL', 'AUTH_COOKIE_SECRET', 'CRON_SECRET']`. If new required vars are added to the system, the health endpoint won't detect their absence unless manually updated.

**Recommendation:** Move the list of required env vars to a shared constant in `packages/shared/src/env.ts` (if one exists) or maintain it alongside the env validation logic.

---

### L4 — `notifyWatchdog` Throttled to 30s With 120s WatchdogSec

**File:** `apps/worker/src/sd-notify.ts` (lines 42-47)  
**Location:** `WATCHDOG_THROTTLE_MS = 30_000`, `WatchdogSec=120`  

**Evidence:** The watchdog is pinged at most once every 30 seconds, and systemd allows 120 seconds before killing the process. This means at most 4 missed pings trigger a restart. With the throttling, if ticks arrive at a rate slower than 30 seconds (e.g., during low-market-activity weekends), the watchdog could miss pings even though the worker is healthy. However, the SignalR consumer's `onTick` triggers `handleIncomingTick` which calls `notifyWatchdog` on first tick, and the heartbeat also calls it independently.

**Impact:** Minimal. The heartbeat timer fires every 30s, ensuring watchdog pings even without ticks. The safety margin (4×) is adequate.

**Recommendation:** No action required. The 30/120 ratio is well-designed. Documented for awareness.

---

## Architecture Strengths

The following reliability patterns deserve explicit recognition:

### 1. Layered Error Handling
Every layer transforms errors into typed classes: `ProviderError` (data) → `AppError` (shared) → HTTP response (API). No raw errors leak to users.

### 2. Health-Aware Failover
`runWithFailover` with exponential decay scoring, pinned providers, `ProviderEmptyError` bypass, and error ranking (quota > HTTP > parse) is sophisticated and well-tested.

### 3. Graceful Shutdown
The worker uses `onShutdown()` with reverse-order cleanup, SIGTERM/SIGINT handling, Sentry flush on double-signal, and systemd `STOPPING=1` notification.

### 4. Idempotent Job Design
`acquireCronLock` with `ON CONFLICT DO NOTHING`, per-job timeouts via `AbortController`, in-flight overlap guards, stale-cleanup on startup, and skip-daily-lock for high-frequency jobs.

### 5. Connection Resilience
SignalR manual rebuild loop with exponential backoff + jitter, Binance WS independent restart, DB connection pool with per-runtime sizing, and `withDbRetry` for transient DB errors.

### 6. Frontend Error Boundaries
Four distinct error boundaries (root, app, chat, journal, chart-class-based) with Sentry integration, inline failure cards preserving app chrome, and class-based boundaries for granular chart error recovery.

### 7. Request Tracing
`X-Request-Id` throughout middleware → API → response, `traceIdStorage` via `AsyncLocalStorage`, diagnostic steps with timing, and `logForAgent` for AI-agent-consumable logs.

### 8. Recovery Documentation
`infra/cron-vm/RECOVERY.md` provides concrete commands for 5 failure scenarios: DB restore, journal restore, worker startup failure, fresh VM provisioning, and credential rotation.

---

## Recommendations Prioritization

### Immediate (Next Sprint)
1. **Fix C1 & C2** — Buffer → DB write atomicity and flush overlap guard (common root cause, single fix)
2. **Fix C3** — Broaden retry classification to include unknown errors

### Short-Term (1–2 Sprints)
3. **Fix H2** — Add DB-level idempotency constraints for snapshot/cot/weekly-review jobs
4. **Fix H4** — Add tick-drop counters and retry buffer
5. **Fix H5** — Migrate `withDbRetry` from string matching to SQLSTATE codes
6. **Fix M1** — Add structured logging in `decryptByok` failure path

### Long-Term (Roadmap)
7. **Fix H1** — Shared health store via Postgres
8. **Fix H3 + M4** — Broader context-overflow detection + circuit breaker
9. **Fix M2** — Cache sweep improvements for Vercel runtime
10. **Fix M5 + M6** — Chat retry UX + request-level timeout

---

## Test Coverage Gaps

Based on the existing 590+ test cases and 173 test files, the following reliability scenarios appear under-tested:

| Scenario | Suggested Test |
|----------|---------------|
| DB outage during tick flush | Integration test with PGlite that simulates `pool.end()` mid-flush |
| Overlapping setInterval flushes | Chaos test that artificially slows DB response to > 1s |
| Retry classification edge cases | Unit test for each provider SDK's error shape (OpenAI, Anthropic, Gemini, DeepSeek, Groq) |
| Context-window overflow from all providers | E2E test with deliberately oversized prompts |
| Cron lock acquisition failure | Integration test that kills the DB during `acquireCronLock` |
| Concurrent `drain()` calls | Unit test that calls `drain()` from two concurrent async contexts |
| SignalR reconnect after extended outage | Integration test with network partition simulation |

---

## Conclusion

HamaFX-Ai has a **solid reliability foundation** with mature patterns across all layers. The most critical risks are concentrated in the **tick data pipeline** (C1, C2) and **error classification** (C3), both of which are addressable with focused engineering effort. The recommended fixes are surgical — they improve resilience without architectural changes, and several can share a common implementation approach (e.g., the self-rescheduling loop pattern already proven in the `multi-agent-analysis` poll can be applied to the flush loop).

The project's investment in structured error handling, health-aware failover, idempotent scheduling, and recovery documentation is commendable and provides a strong baseline for the improvements suggested in this audit.
