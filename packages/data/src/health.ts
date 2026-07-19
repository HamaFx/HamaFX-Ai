/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Per-provider rolling health snapshot.
//
// `runWithFailover` consults this so it doesn't always retry a provider that
// has been failing for the last few minutes. The data structure is a tiny
// circular buffer per provider — no allocations on the hot path, no upstream
// dep, fits the personal-mode "no Upstash" rule.
//
// Health windows are short (5 min default) so a single bad minute doesn't
// permanently sideline a provider — it self-heals on the next success.
//
// H1 (RELIABILITY_AUDIT_REPORT.md) — Cross-instance health sharing.
//
// The in-memory samples track per-instance state (fast path). On failure,
// we also write to a lightweight Postgres-backed `provider_health` table
// so *other* Vercel instances can see that a provider is degraded. The
// DB write is fire-and-forget — no caller blocks on health telemetry.
// `getScore()` merges in-memory and DB state, taking the worst-case
// consecutive-failure count across all instances.
//
// DB reads are guarded behind a short cache (10s) so the fast path (single
// in-memory lookup) is preserved for the steady state.

import { getDb, schema } from '@hamafx/db';
import { eq, sql } from 'drizzle-orm';

const { providerHealth } = schema;

const WINDOW_MS = 5 * 60 * 1000;

/** Minimum interval between DB cross-instance reads for the same provider. */
const DB_CACHE_MS = 10_000;

interface Sample {
  /** ms epoch UTC. */
  t: number;
  ok: boolean;
}

interface State {
  samples: Sample[];
}

interface DbCacheEntry {
  /** Epoch ms when the DB was last read for this provider. */
  readAt: number;
  /** Cached `consecutive_failures` from the DB. */
  consecutiveFailures: number;
  /** Cached `last_failure_at` epoch ms from the DB. */
  lastFailureAt: number;
}

const state = new Map<string, State>();
const dbCache = new Map<string, DbCacheEntry>();

function s(provider: string): State {
  let st = state.get(provider);
  if (!st) {
    st = { samples: [] };
    state.set(provider, st);
  }
  return st;
}

function trim(st: State, now: number): void {
  const cutoff = now - WINDOW_MS;
  // The list is appended chronologically; drop the head until first in-window.
  let i = 0;
  while (i < st.samples.length && st.samples[i]!.t < cutoff) i += 1;
  if (i > 0) st.samples.splice(0, i);
}

/**
 * Count consecutive trailing failures. Returns 0 when the last sample
 * is a success or there are no samples.
 */
function consecutiveFailures(st: State): number {
  let count = 0;
  for (let i = st.samples.length - 1; i >= 0; i--) {
    if (!st.samples[i]!.ok) count += 1;
    else break;
  }
  return count;
}

export function recordSuccess(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  st.samples.push({ t: now, ok: true });
  trim(st, now);

  // H1 — reset the cross-instance failure counter in the DB.
  // Fire-and-forget: a caller never blocks on health telemetry.
  void dbRecordSuccess(provider);
}

export function recordFailure(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  st.samples.push({ t: now, ok: false });
  trim(st, now);

  // H1 — bump the cross-instance failure counter in the DB.
  // Fire-and-forget: a caller never blocks on health telemetry.
  void dbRecordFailure(provider);
}

// ── H1 DB-backed cross-instance state ────────────────────────────────────

async function dbRecordSuccess(provider: string): Promise<void> {
  try {
    const db = getDb();
    await db
      .insert(providerHealth)
      .values({
        provider,
        lastSuccessAt: sql`now()`,
        consecutiveFailures: 0,
      })
      .onConflictDoUpdate({
        target: providerHealth.provider,
        set: {
          lastSuccessAt: sql`now()`,
          consecutiveFailures: 0,
        },
      });
  } catch {
    // Best-effort — DB may be unavailable. In-memory state is authoritative
    // for this instance.
  }
}

async function dbRecordFailure(provider: string): Promise<void> {
  try {
    const db = getDb();
    await db
      .insert(providerHealth)
      .values({
        provider,
        lastFailureAt: sql`now()`,
        consecutiveFailures: 1,
      })
      .onConflictDoUpdate({
        target: providerHealth.provider,
        set: {
          lastFailureAt: sql`now()`,
          consecutiveFailures: sql`${providerHealth.consecutiveFailures} + 1`,
        },
      });
  } catch {
    // Best-effort.
  }
}

/** Read the cross-instance state from the DB, cached for DB_CACHE_MS. */
function getDbConsecutiveFailures(provider: string): number {
  const cached = dbCache.get(provider);
  const now = Date.now();
  if (cached && now - cached.readAt < DB_CACHE_MS) {
    // Check freshness: if the cached last_failure is older than the window,
    // treat as zero (provider has recovered).
    if (cached.lastFailureAt > 0 && now - cached.lastFailureAt > WINDOW_MS) {
      return 0;
    }
    return cached.consecutiveFailures;
  }

  // Cold cache — fire a best-effort DB read. On the very first call for
  // a provider, we return 0 (fail-open, no penalty) while the async read
  // populates the cache for the next call. This avoids blocking failover
  // ordering on DB latency while still getting cross-instance state within
  // one scoring cycle.
  void populateDbCache(provider, now);

  // Return cached value (possibly zero for first call) while the async read
  // is in flight. This is fail-open: an uninitialised cache returns 0,
  // which is the neutral/no-penalty position.
  if (cached) return cached.consecutiveFailures;
  return 0;
}

async function populateDbCache(provider: string, readAt: number): Promise<void> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        consecutiveFailures: providerHealth.consecutiveFailures,
        lastFailureAt: providerHealth.lastFailureAt,
      })
      .from(providerHealth)
      .where(eq(providerHealth.provider, provider))
      .limit(1);

    const row = rows[0];
    const lastMs = row?.lastFailureAt ? row.lastFailureAt.getTime() : 0;
    dbCache.set(provider, {
      readAt,
      consecutiveFailures: row?.consecutiveFailures ?? 0,
      lastFailureAt: lastMs,
    });
  } catch {
    // Best-effort — cache stays stale until next attempt.
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export interface HealthSnapshot {
  /** Number of samples in the current 5-minute window. */
  samples: number;
  /** Successes in window. */
  ok: number;
  /** Failures in window. */
  failed: number;
  /** Failure rate in window. 0 when no samples (= "unknown, treat as healthy"). */
  failureRate: number;
}

export function getHealth(provider: string): HealthSnapshot {
  const now = Date.now();
  const st = s(provider);
  trim(st, now);
  let ok = 0;
  let failed = 0;
  for (const e of st.samples) {
    if (e.ok) ok += 1;
    else failed += 1;
  }
  const total = ok + failed;
  return {
    samples: total,
    ok,
    failed,
    failureRate: total === 0 ? 0 : failed / total,
  };
}

/**
 * Score a provider for failover ordering. Higher = healthier.
 *
 * Merges in-memory samples (fast, per-instance) with cross-instance DB
 * state (H1 fix). Uses the maximum consecutive-failure count from either
 * source, so if ANY instance sees the provider failing, the score
 * reflects the worst case.
 *
 * Exponential decay: each consecutive trailing failure doubles its weight.
 *
 *  - Unknown (no samples, no DB): neutral 0.5 — give it a chance.
 *  - Mostly fresh successes: ~1.0.
 *  - Consecutive failures: drops toward 0 exponentially.
 */
export function getScore(provider: string): number {
  const st = s(provider);
  const now = Date.now();
  trim(st, now);

  // H1 — merge cross-instance failure count from the DB.
  const dbConsec = getDbConsecutiveFailures(provider);

  if (st.samples.length === 0) {
    // No local samples — use DB state if available.
    if (dbConsec === 0) return 0.5;
    // DB shows consecutive failures — compute score from that alone.
    const total = dbConsec;
    let weighted = 0;
    for (let i = 0; i < dbConsec; i++) {
      weighted += Math.pow(2, i);
    }
    return Math.max(0, 1 - weighted / total);
  }

  const localConsec = consecutiveFailures(st);
  // Take the worst of local and cross-instance.
  const consec = Math.max(localConsec, dbConsec);
  let weightedFailures = 0;
  let weightedTotal = 0;

  for (let idx = 0; idx < st.samples.length; idx++) {
    const sample = st.samples[idx]!;
    weightedTotal += 1;
    if (!sample.ok) {
      // Penalty is 2^{consecutive position from the end} so recent
      // consecutive failures dominate the score. A single isolated
      // failure counts as 1; 3 consecutive failures count as 1+2+4=7.
      const positionFromEnd = st.samples.length - 1 - idx;
      const distance = Math.max(0, consec - positionFromEnd - 1);
      weightedFailures += Math.pow(2, distance);
    }
  }

  const failureRate = weightedFailures / weightedTotal;
  return Math.max(0, 1 - failureRate);
}

/** Test helper. */
export function _resetHealth(): void {
  state.clear();
  dbCache.clear();
}
