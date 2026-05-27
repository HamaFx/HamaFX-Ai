// Per-provider rolling health snapshot.
//
// `runWithFailover` consults this so it doesn't always retry a provider that
// has been failing for the last few minutes. The data structure is a tiny
// circular buffer per provider — no allocations on the hot path, no upstream
// dep, fits the personal-mode "no Upstash" rule.
//
// Health windows are short (5 min default) so a single bad minute doesn't
// permanently sideline a provider — it self-heals on the next success.

const WINDOW_MS = 5 * 60 * 1000;

interface Sample {
  /** ms epoch UTC. */
  t: number;
  ok: boolean;
}

interface State {
  samples: Sample[];
}

const state = new Map<string, State>();

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

export function recordSuccess(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  st.samples.push({ t: now, ok: true });
  trim(st, now);
}

export function recordFailure(provider: string): void {
  const now = Date.now();
  const st = s(provider);
  st.samples.push({ t: now, ok: false });
  trim(st, now);
}

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
 *  - Unknown (no samples): neutral 0.5 — give it a chance.
 *  - Mostly fresh successes: ~1.0.
 *  - Recent burst of failures: drops toward 0 quickly.
 *
 * `runWithFailover` sorts attempts by score descending while preserving
 * the caller-provided order on ties.
 */
export function getScore(provider: string): number {
  const h = getHealth(provider);
  if (h.samples === 0) return 0.5;
  return Math.max(0, 1 - h.failureRate);
}

/** Test helper. */
export function _resetHealth(): void {
  state.clear();
}
