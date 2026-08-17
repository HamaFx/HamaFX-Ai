/**
 * Copyright 2026 Kestrel
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

/**
 * Phase D — durable, typed counters and histograms.
 *
 * A dependency-free in-process metrics registry so the AI and worker flows
 * can record SLIs (request/tool/budget counts, TTFB, latency, cost) with a
 * stable, typed metric name instead of ad-hoc log fields. The snapshot is
 * JSON-serializable and can be pushed to any backend (Prometheus exporter,
 * Langfuse, health payload) later without changing the call sites.
 *
 * This intentionally stays vendor-neutral, matching the event/span
 * envelopes in `observability.ts`. Exact percentiles need a reservoir, so
 * the registry tracks fixed cumulative buckets instead — enough for
 * `histogram_quantile`-style p50/p95 estimates in Grafana.
 */

/** Stable metric names for AI and queued-analysis SLIs. */
export const METRIC_NAMES = [
  'chat_request_total',
  'chat_turn_total',
  'tool_call_total',
  'tool_fail_total',
  'provider_fallback_total',
  'provider_attempt_failed_total',
  'budget_reserved_total',
  'budget_release_failed_total',
  'agent_failed_total',
  'run_failed_total',
  'ttft_ms',
  'total_latency_ms',
  'turn_cost_usd',
  // Exporter + worker health signals.
  'metrics_flush_failed_total',
  'worker_flush_total',
  'worker_tick_freshness_ms',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export function isMetricName(value: string): value is MetricName {
  return (METRIC_NAMES as readonly string[]).includes(value);
}

export interface HistogramSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  /** Cumulative bucket counts aligned with `HISTOGRAM_BUCKET_BOUNDS_MS`. */
  buckets: number[];
}

/** Serialized form of the whole registry, safe to log / POST / JSON-stringify. */
export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
}

/**
 * Fixed upper bounds (same unit as observed values) for histogram buckets.
 * Observations are counted into every bucket whose bound is >= the value, so
 * bucket `i` is cumulative: `buckets[i]` = observations <= `BUCKET_BOUNDS[i]`.
 * These make `{name}_bucket{le="…"}` series available for p95-style
 * percentiles via `histogram_quantile` in Grafana. Values are recorded in
 * milliseconds by every caller (ttft, turn latency, tick freshness), so the
 * bounds are ms-based.
 */
export const HISTOGRAM_BUCKET_BOUNDS_MS = [
  1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000,
] as const;

interface HistogramAccumulator {
  count: number;
  sum: number;
  min: number;
  max: number;
  /** Cumulative count of observations <= each bound (aligned with HISTOGRAM_BUCKET_BOUNDS_MS). */
  buckets: number[];
}

function keyFor(name: MetricName, tags?: Record<string, string>): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const sorted = Object.entries(tags)
    .map(([k, v]) => [k, v] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return `${name}{${sorted.map(([k, v]) => `${k}=${v}`).join(',')}}`;
}

/**
 * A simple, monotonic metrics registry. Counter increments and histogram
 * observations are accumulated in memory; `snapshot()` flattens them for
 * export. Instances are independent so tests can construct their own.
 */
export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramAccumulator>();

  /** Increment a counter (defaults to +1). */ 
  increment(name: MetricName, opts?: { by?: number; tags?: Record<string, string> }): void {
    const key = keyFor(name, opts?.tags);
    const next = (this.counters.get(key) ?? 0) + (opts?.by ?? 1);
    this.counters.set(key, next);
  }

  /** Record one observation into a histogram. */ 
  observe(name: MetricName, value: number, opts?: { tags?: Record<string, string> }): void {
    if (!Number.isFinite(value)) return;
    const key = keyFor(name, opts?.tags);
    const current = this.histograms.get(key);
    if (!current) {
      const buckets = HISTOGRAM_BUCKET_BOUNDS_MS.map(() => 0);
      for (let i = 0; i < buckets.length; i++) {
        if (value <= HISTOGRAM_BUCKET_BOUNDS_MS[i]!) buckets[i] = 1;
      }
      this.histograms.set(key, { count: 1, sum: value, min: value, max: value, buckets });
      return;
    }
    current.count += 1;
    current.sum += value;
    if (value < current.min) current.min = value;
    if (value > current.max) current.max = value;
    for (let i = 0; i < current.buckets.length; i++) {
      if (value <= HISTOGRAM_BUCKET_BOUNDS_MS[i]!) {
        current.buckets[i] = current.buckets[i]! + 1;
      }
    }
  }

  /** Export a flat, JSON-serializable snapshot of the registry. */ 
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [key, value] of this.counters) counters[key] = value;

    const histograms: Record<string, HistogramSummary> = {};
    for (const [key, acc] of this.histograms) {
      histograms[key] = {
        count: acc.count,
        sum: acc.sum,
        avg: acc.count > 0 ? acc.sum / acc.count : 0,
        min: acc.min,
        max: acc.max,
        // Copy so callers cannot mutate the live accumulator through the snapshot.
        buckets: [...acc.buckets],
      };
    }

    return { counters, histograms };
  }

  /** Reset all counters and histograms (used between test cases / reports). */ 
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}

/** Process-wide default registry for app code that doesn't need DI. */
export const metrics = new MetricsRegistry();
